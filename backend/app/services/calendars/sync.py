"""Calendar sync + cross-calendar dedup + 30s auto-record poller."""
import json
import logging
import re
import threading
import time
from datetime import datetime, timedelta, timezone

from ...db import get_db, get_setting, new_id
from ...events import hub
from . import apple_cal, google_cal, ms_cal

log = logging.getLogger("aguacate.calsync")

POLL_INTERVAL = 30  # seconds, per spec
PROMPT_WINDOW = 35  # prompt when start is within this many seconds


def _norm_title(title: str) -> str:
    return re.sub(r"\s+", " ", title.strip().lower())


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        if len(value) == 10:  # date-only (all-day)
            return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def dedup_key(title: str, start: str | None) -> str:
    """Same meeting on multiple calendars → one key: norm title + 5-min start bucket."""
    dt = _parse_dt(start)
    bucket = ""
    if dt:
        dt = dt.astimezone(timezone.utc)
        bucket = dt.replace(
            minute=(dt.minute // 5) * 5, second=0, microsecond=0
        ).isoformat()
    return f"{_norm_title(title)}|{bucket}"


def sync_now() -> int:
    """Fetch from all connected providers, dedup, upsert calendar_events."""
    now = datetime.now(timezone.utc)
    time_min = (now - timedelta(hours=1)).isoformat()
    time_max = (now + timedelta(hours=18)).isoformat()

    raw: list[dict] = []
    if google_cal.is_connected():
        raw += google_cal.fetch_events(time_min, time_max)
    if ms_cal.is_connected():
        raw += ms_cal.fetch_events(time_min, time_max)
    if get_setting("apple_calendar_enabled", False):
        raw += apple_cal.fetch_events(hours_ahead=18)

    merged: dict[str, dict] = {}
    for ev in raw:
        key = dedup_key(ev["title"], ev.get("start"))
        existing = merged.get(key)
        if existing:
            existing["provider_ids"].append(f"{ev['provider']}:{ev['provider_id']}")
            existing["attendees"] = sorted(
                {a for a in existing["attendees"] + ev.get("attendees", []) if a}
            )
            existing["cancelled"] = existing["cancelled"] and ev.get("cancelled", False)
        else:
            merged[key] = {
                "id": key,
                "provider": ev["provider"],
                "provider_ids": [f"{ev['provider']}:{ev['provider_id']}"],
                "title": ev["title"],
                "start": ev.get("start"),
                "end": ev.get("end"),
                "attendees": [a for a in ev.get("attendees", []) if a],
                "cancelled": bool(ev.get("cancelled")),
            }

    db = get_db()
    for ev in merged.values():
        db.execute(
            """INSERT INTO calendar_events(id,provider,provider_ids,title,start,end,attendees,cancelled)
               VALUES(?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                 provider_ids=excluded.provider_ids, title=excluded.title,
                 start=excluded.start, end=excluded.end,
                 attendees=excluded.attendees, cancelled=excluded.cancelled""",
            (
                ev["id"],
                ev["provider"],
                json.dumps(ev["provider_ids"]),
                ev["title"],
                ev["start"],
                ev["end"],
                json.dumps(ev["attendees"]),
                int(ev["cancelled"]),
            ),
        )
    db.commit()
    hub.emit("calendar_synced", {"count": len(merged)})
    return len(merged)


def upcoming_events(limit: int = 12) -> list[dict]:
    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    rows = db.execute(
        "SELECT * FROM calendar_events WHERE start >= ? ORDER BY start LIMIT ?",
        (cutoff, limit),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["attendees"] = json.loads(d["attendees"] or "[]")
        d["provider_ids"] = json.loads(d["provider_ids"] or "[]")
        out.append(d)
    return out


def _is_excluded(title: str) -> bool:
    """Privacy: calendar events matching exclusion patterns are never recorded."""
    patterns = get_setting("exclude_patterns", [])
    lower = title.lower()
    return any(
        isinstance(p, str) and p.strip() and p.strip().lower() in lower
        for p in patterns
    )


def _check_briefs() -> None:
    """30 minutes before a meeting: emit pre-meeting intelligence."""
    from .. import intelligence

    db = get_db()
    now = datetime.now(timezone.utc)
    for row in db.execute(
        "SELECT * FROM calendar_events WHERE cancelled=0 AND briefed=0"
    ).fetchall():
        start = _parse_dt(row["start"])
        if not start:
            continue
        until = (start - now).total_seconds()
        if 0 < until <= 30 * 60:
            db.execute("UPDATE calendar_events SET briefed=1 WHERE id=?", (row["id"],))
            db.commit()
            if _is_excluded(row["title"]):
                continue
            attendees = json.loads(row["attendees"] or "[]")
            brief = intelligence.meeting_brief(attendees, row["title"])
            if brief["meetings"]:  # only brief when there's actual history
                hub.emit(
                    "meeting_brief",
                    {
                        "event_id": row["id"],
                        "title": row["title"],
                        "start": row["start"],
                        "minutes_until": int(until // 60),
                        **brief,
                    },
                )


def _check_retention() -> None:
    """Privacy: auto-delete meetings older than the configured retention."""
    days = get_setting("retention_days", 0)
    if not isinstance(days, (int, float)) or days <= 0:
        return
    import os

    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    old = db.execute(
        "SELECT id, audio_path, transcript_path, notes_path FROM meetings "
        "WHERE started_at < ?",
        (cutoff,),
    ).fetchall()
    for m in old:
        for key in ("audio_path", "transcript_path", "notes_path"):
            path = m[key]
            if path:
                try:
                    os.remove(path)
                except OSError:
                    pass
        db.execute("DELETE FROM meetings WHERE id=?", (m["id"],))
    if old:
        db.commit()
        log.info("Retention: deleted %d meetings older than %s days", len(old), days)
        hub.emit("retention_cleanup", {"deleted": len(old)})


_last_pulse_date: str | None = None


def _check_daily_pulse() -> None:
    """Once per day (first poll after 08:00 local): emit the Action Pulse."""
    global _last_pulse_date
    from .. import intelligence

    local_now = datetime.now()
    today = local_now.date().isoformat()
    if local_now.hour < 8 or _last_pulse_date == today:
        return
    _last_pulse_date = today
    pulse = intelligence.action_pulse()
    if pulse["stale_count"] or pulse["meeting_today_actions"]:
        hub.emit("daily_pulse", pulse)


def _check_auto_record() -> None:
    """Fires meeting_prompt / auto-start according to the recording mode."""
    mode = get_setting("recording_mode", "confirm_30s")  # all|confirm_30s|manual|off
    if mode in ("manual", "off"):
        return
    db = get_db()
    now = datetime.now(timezone.utc)
    for row in db.execute(
        "SELECT * FROM calendar_events WHERE cancelled=0 AND prompted=0 "
        "AND recorded_meeting_id IS NULL"
    ).fetchall():
        if _is_excluded(row["title"]):
            db.execute("UPDATE calendar_events SET prompted=1 WHERE id=?", (row["id"],))
            db.commit()
            continue
        start = _parse_dt(row["start"])
        if not start:
            continue
        until = (start - now).total_seconds()
        if -60 <= until <= PROMPT_WINDOW:
            db.execute(
                "UPDATE calendar_events SET prompted=1 WHERE id=?", (row["id"],)
            )
            db.commit()
            payload = {
                "event_id": row["id"],
                "title": row["title"],
                "start": row["start"],
                "attendees": json.loads(row["attendees"] or "[]"),
                "seconds_until_start": max(0, int(until)),
                "mode": mode,
            }
            if mode == "all":
                hub.emit("auto_record_starting", payload)
            else:
                hub.emit("meeting_prompt", payload)


_poller_started = False


def start_poller() -> None:
    global _poller_started
    if _poller_started:
        return
    _poller_started = True

    def loop():
        last_sync = 0.0
        last_housekeeping = 0.0
        while True:
            try:
                # full provider sync every 30s per spec; auto-record check every loop
                if time.time() - last_sync >= POLL_INTERVAL:
                    sync_now()
                    last_sync = time.time()
                _check_auto_record()
                _check_briefs()
                if time.time() - last_housekeeping >= 3600:
                    _check_retention()
                    last_housekeeping = time.time()
                _check_daily_pulse()
            except Exception:
                log.exception("Calendar poller iteration failed")
            time.sleep(5)

    threading.Thread(target=loop, daemon=True).start()


def connection_status() -> dict:
    return {
        "google": google_cal.is_connected(),
        "microsoft": ms_cal.is_connected(),
        "apple": bool(get_setting("apple_calendar_enabled", False)),
        "google_configured": bool(google_cal.client_id()),
        "microsoft_configured": bool(ms_cal.client_id()),
    }
