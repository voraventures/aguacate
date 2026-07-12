"""Recording → transcription → notes → intelligence pipeline (background thread)."""
import json
import logging
import threading
import wave
from pathlib import Path

import numpy as np

from ..db import get_db, now_iso
from ..events import hub
from . import intelligence, notes, transcriber

log = logging.getLogger("aguacate.pipeline")

# Real speech peaks well above this even at low mic gain; digital silence
# (dead input device, e.g. a virtual/loopback device with nothing routed
# into it) reads as exactly 0.0. Catches that case before wasting a
# transcription pass and a paid notes-generation call on empty audio.
SILENCE_PEAK_THRESHOLD = 0.01


def _is_silent(audio_path: Path) -> bool:
    try:
        with wave.open(str(audio_path), "rb") as wf:
            raw = wf.readframes(wf.getnframes())
        if not raw:
            return True
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
        return float(np.abs(data).max()) < SILENCE_PEAK_THRESHOLD
    except Exception:
        return False  # unreadable file — let transcription surface the real error


def _safe_error(exc: Exception) -> str:
    """Only our own RuntimeError messages reach the renderer; third-party
    exception text stays in server-side logs (C8)."""
    if isinstance(exc, RuntimeError):
        return str(exc)[:300]
    return "Processing failed — check the app logs for details."


def _set_status(meeting_id: str, status: str, error: str | None = None) -> None:
    db = get_db()
    db.execute(
        "UPDATE meetings SET status=?, error=? WHERE id=?", (status, error, meeting_id)
    )
    db.commit()
    hub.emit("meeting_status", {"meeting_id": meeting_id, "status": status, "error": error})


def _fmt_ts(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


def _flagged_moments_section(markers: list, segments: list[dict]) -> str | None:
    """Build a deterministic 'Flagged Moments' section: verbatim transcript
    context (±20s) around each moment the user marked during the meeting."""
    if not markers or not segments:
        return None
    lines = []
    for marker in markers:
        window = [
            s["text"]
            for s in segments
            if s["end"] >= marker - 20 and s["start"] <= marker + 20
        ]
        if window:
            quote = " ".join(window).strip()[:400]
            lines.append(f'- **[{_fmt_ts(marker)}]** "{quote}"')
    if not lines:
        return None
    return "## Flagged Moments\n" + "\n".join(lines)


def _generate_and_index(meeting_id: str, transcript_text: str, segments: list[dict]) -> None:
    """Notes via Claude (with the meeting's template) + intelligence indexing +
    flagged moments + conflict detection."""
    db = get_db()
    row = db.execute(
        "SELECT title, attendees, template_id, markers FROM meetings WHERE id=?",
        (meeting_id,),
    ).fetchone()
    attendees = json.loads(row["attendees"]) if row else []
    markers = json.loads(row["markers"] or "[]") if row else []

    generated = notes.generate_notes(
        meeting_id,
        row["title"] if row else "Meeting",
        transcript_text,
        attendees,
        template_id=row["template_id"] if row else None,
    )
    content = generated["content"]

    flagged = _flagged_moments_section(markers, segments)
    if flagged:
        content = f"{content}\n\n{flagged}"
        from ..config import NOTES_DIR, write_secure_text

        write_secure_text(NOTES_DIR / f"{meeting_id}.md", content)

    sections = notes.split_sections(content)
    db.execute(
        "INSERT OR REPLACE INTO notes(meeting_id,content,sections,generated_at) "
        "VALUES(?,?,?,?)",
        (meeting_id, content, json.dumps(sections), now_iso()),
    )
    db.execute(
        "UPDATE meetings SET notes_path=? WHERE id=?", (generated["path"], meeting_id)
    )
    db.commit()

    intelligence.index_notes(meeting_id, content)

    # Contradiction detection is best-effort — never fails the pipeline.
    try:
        from .conflicts import detect_conflicts

        detect_conflicts(meeting_id)
    except Exception:
        log.exception("Conflict detection failed for %s", meeting_id)


def process_meeting(meeting_id: str, audio_path: Path) -> None:
    """Runs in a worker thread after recording stops."""
    db = get_db()
    try:
        db.execute(
            "UPDATE meetings SET ended_at=?, audio_path=? WHERE id=?",
            (now_iso(), str(audio_path), meeting_id),
        )
        db.commit()

        if _is_silent(audio_path):
            _set_status(
                meeting_id,
                "error",
                "No audio captured — check your input device in Settings → Recording.",
            )
            return

        _set_status(meeting_id, "transcribing")
        result = transcriber.transcribe(meeting_id, audio_path)
        db.execute(
            "INSERT OR REPLACE INTO transcripts(meeting_id,text,language,duration_sec,segments) "
            "VALUES(?,?,?,?,?)",
            (
                meeting_id,
                result["text"],
                result["language"],
                result["duration_sec"],
                json.dumps(result["segments"]),
            ),
        )
        db.execute(
            "UPDATE meetings SET transcript_path=? WHERE id=?",
            (result["path"], meeting_id),
        )
        db.commit()

        _set_status(meeting_id, "generating")
        _generate_and_index(meeting_id, result["text"], result["segments"])
        _set_status(meeting_id, "ready")
    except Exception as exc:
        log.exception("Pipeline failed for meeting %s", meeting_id)
        _set_status(meeting_id, "error", _safe_error(exc))


def process_meeting_async(meeting_id: str, audio_path: Path) -> None:
    threading.Thread(
        target=process_meeting, args=(meeting_id, audio_path), daemon=True
    ).start()


def regenerate_notes_async(meeting_id: str, template_id: str | None = None) -> None:
    """Re-run notes generation from the existing transcript, optionally with a
    different template."""

    def _run():
        db = get_db()
        try:
            t = db.execute(
                "SELECT text, segments FROM transcripts WHERE meeting_id=?",
                (meeting_id,),
            ).fetchone()
            if not t:
                raise RuntimeError("No transcript available for this meeting")
            if template_id is not None:
                db.execute(
                    "UPDATE meetings SET template_id=? WHERE id=?",
                    (template_id, meeting_id),
                )
                db.commit()
            _set_status(meeting_id, "generating")
            segments = json.loads(t["segments"] or "[]")
            _generate_and_index(meeting_id, t["text"], segments)
            _set_status(meeting_id, "ready")
        except Exception as exc:
            log.exception("Regenerate failed for %s", meeting_id)
            _set_status(meeting_id, "error", _safe_error(exc))

    threading.Thread(target=_run, daemon=True).start()
