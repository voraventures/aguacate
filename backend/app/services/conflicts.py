"""Contradiction detector: new decisions vs the standing decision log."""
import json
import logging

from ..db import get_db, new_id, now_iso
from ..events import hub
from .ai import _extract_json
from .notes import current_model, get_client

log = logging.getLogger("aguacate.conflicts")


def detect_conflicts(meeting_id: str) -> list[dict]:
    """Compare this meeting's decisions against prior active decisions.
    Non-fatal by design — callers wrap in try/except."""
    db = get_db()
    new_rows = db.execute(
        "SELECT id, text FROM decisions WHERE meeting_id=?", (meeting_id,)
    ).fetchall()
    old_rows = db.execute(
        """SELECT d.id, d.text, d.decided_at, m.id AS mid, m.title
           FROM decisions d JOIN meetings m ON m.id=d.meeting_id
           WHERE d.meeting_id != ? AND d.status='active'
           ORDER BY d.decided_at DESC LIMIT 80""",
        (meeting_id,),
    ).fetchall()
    if not new_rows or not old_rows:
        return []

    new_list = "\n".join(f"- {r['text']}" for r in new_rows)
    old_list = "\n".join(
        f"[{r['id']}] ({r['decided_at'][:10]}, \"{r['title']}\") {r['text']}"
        for r in old_rows
    )
    client = get_client()
    message = client.messages.create(
        model=current_model(),
        max_tokens=900,
        system=(
            "You detect genuine contradictions between decisions. Output ONLY a "
            "JSON array (often empty): "
            '[{"new_decision": "verbatim new decision", "old_id": "id of the '
            'contradicted old decision", "explanation": "one sentence on why '
            'they conflict"}]. A conflict means they CANNOT both hold (different '
            "dates for the same launch, opposite choices on the same question). "
            "Refinements, follow-ups, and unrelated topics are NOT conflicts. "
            "Be conservative."
        ),
        messages=[
            {
                "role": "user",
                "content": f"New decisions:\n{new_list}\n\nStanding decisions:\n{old_list}",
            }
        ],
    )
    text = "".join(b.text for b in message.content if b.type == "text")
    try:
        found = _extract_json(text)
    except (ValueError, json.JSONDecodeError):
        return []

    old_by_id = {r["id"]: r for r in old_rows}
    created = []
    for item in found if isinstance(found, list) else []:
        old = old_by_id.get(item.get("old_id"))
        if not old:
            continue
        cid = new_id()
        db.execute(
            """INSERT INTO conflicts(id,meeting_id,new_decision,old_decision,
               old_meeting_id,old_meeting_title,old_date,explanation,created_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (
                cid,
                meeting_id,
                str(item.get("new_decision", ""))[:500],
                old["text"][:500],
                old["mid"],
                old["title"],
                old["decided_at"],
                str(item.get("explanation", ""))[:400],
                now_iso(),
            ),
        )
        created.append(cid)
    db.commit()
    if created:
        hub.emit("conflicts_found", {"meeting_id": meeting_id, "count": len(created)})
    return created


def conflicts_for_meeting(meeting_id: str) -> list[dict]:
    return [
        dict(r)
        for r in get_db().execute(
            "SELECT * FROM conflicts WHERE meeting_id=? ORDER BY created_at",
            (meeting_id,),
        )
    ]


def resolve_conflict(conflict_id: str, resolution: str) -> bool:
    """resolution: 'superseded' marks the old decision superseded; 'reviewed'
    just closes the flag."""
    db = get_db()
    row = db.execute("SELECT * FROM conflicts WHERE id=?", (conflict_id,)).fetchone()
    if not row:
        return False
    status = "superseded" if resolution == "superseded" else "reviewed"
    db.execute("UPDATE conflicts SET status=? WHERE id=?", (status, conflict_id))
    if status == "superseded" and row["old_meeting_id"]:
        db.execute(
            "UPDATE decisions SET status='superseded' WHERE meeting_id=? AND text=?",
            (row["old_meeting_id"], row["old_decision"]),
        )
    db.commit()
    return True
