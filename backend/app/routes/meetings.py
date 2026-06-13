"""Meeting CRUD, notes retrieval, search."""
import json
import secrets as _secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import get_db, new_id, now_iso, row_to_dict
from ..services import intelligence, notes as notes_svc, pipeline

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


class RenameBody(BaseModel):
    title: str = Field(min_length=1, max_length=300)


class CreateMeetingBody(BaseModel):
    """Create a fully-formed meeting from supplied notes (used by the onboarding
    demo). Action items / decisions / topics are derived from notes_markdown the
    same way the recording pipeline does, so the meeting behaves like a real one."""
    title: str = Field(min_length=1, max_length=300)
    date: str | None = Field(default=None, max_length=64)
    attendees: list[str] = Field(default_factory=list)
    notes_markdown: str = Field(min_length=1, max_length=200000)
    # Accepted for API compatibility; content is derived from notes_markdown.
    source: str | None = None
    duration_seconds: int | None = None
    context: str | None = None
    key_discussions: str | None = None
    decisions: list | None = None
    action_items: list | None = None


class RegenerateBody(BaseModel):
    template_id: str | None = Field(default=None, max_length=64)


class FollowupBody(BaseModel):
    tone: str = Field(default="professional", pattern="^(professional|friendly|concise)$")


@router.get("")
def list_meetings():
    db = get_db()
    rows = db.execute(
        """SELECT m.*,
             (SELECT COUNT(*) FROM action_items a WHERE a.meeting_id=m.id AND a.status='open') AS open_actions
           FROM meetings m ORDER BY m.started_at DESC"""
    ).fetchall()
    return [row_to_dict(r) for r in rows]


@router.post("")
def create_meeting(body: CreateMeetingBody):
    """Insert a ready-to-view meeting plus its notes, then index actions/
    decisions/topics from the markdown (mirrors pipeline._generate_and_index)."""
    db = get_db()
    meeting_id = new_id()
    started = (body.date or now_iso()).strip() or now_iso()
    db.execute(
        "INSERT INTO meetings(id,title,started_at,ended_at,status,attendees) "
        "VALUES(?,?,?,?,?,?)",
        (meeting_id, body.title.strip(), started, now_iso(), "ready",
         json.dumps([a for a in body.attendees if isinstance(a, str)])),
    )
    sections = notes_svc.split_sections(body.notes_markdown)
    db.execute(
        "INSERT OR REPLACE INTO notes(meeting_id,content,sections,generated_at) "
        "VALUES(?,?,?,?)",
        (meeting_id, body.notes_markdown, json.dumps(sections), now_iso()),
    )
    db.commit()
    intelligence.index_notes(meeting_id, body.notes_markdown)
    return {"id": meeting_id, "meeting_id": meeting_id}


@router.get("/search")
def search(q: str = Query(min_length=1, max_length=200)):
    """Full-text search across titles, notes, transcripts, and action items."""
    like = f"%{q}%"
    db = get_db()
    rows = db.execute(
        """SELECT DISTINCT m.* FROM meetings m
           LEFT JOIN notes n ON n.meeting_id = m.id
           LEFT JOIN transcripts t ON t.meeting_id = m.id
           LEFT JOIN action_items a ON a.meeting_id = m.id
           WHERE m.title LIKE ? OR n.content LIKE ? OR t.text LIKE ?
              OR a.action LIKE ? OR a.owner LIKE ?
           ORDER BY m.started_at DESC LIMIT 50""",
        (like, like, like, like, like),
    ).fetchall()
    return [row_to_dict(r) for r in rows]


@router.get("/{meeting_id}")
def get_meeting(meeting_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM meetings WHERE id=?", (meeting_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Meeting not found")
    meeting = row_to_dict(row)

    note = db.execute(
        "SELECT content, sections, generated_at FROM notes WHERE meeting_id=?",
        (meeting_id,),
    ).fetchone()
    meeting["notes"] = (
        {
            "content": note["content"],
            "sections": json.loads(note["sections"] or "{}"),
            "generated_at": note["generated_at"],
        }
        if note
        else None
    )
    transcript = db.execute(
        "SELECT text, language, duration_sec FROM transcripts WHERE meeting_id=?",
        (meeting_id,),
    ).fetchone()
    meeting["transcript"] = dict(transcript) if transcript else None
    if meeting["transcript"]:
        meeting["transcript"].pop("segments", None)  # heavy; not needed by UI
    meeting["intelligence"] = intelligence.meeting_intelligence(meeting_id)
    meeting["coach"] = json.loads(meeting["coach"]) if meeting.get("coach") else None
    try:
        meeting["markers"] = json.loads(meeting.get("markers") or "[]")
    except (json.JSONDecodeError, TypeError):
        meeting["markers"] = []
    from ..services.conflicts import conflicts_for_meeting

    meeting["conflicts"] = conflicts_for_meeting(meeting_id)
    return meeting


@router.patch("/{meeting_id}")
def rename_meeting(meeting_id: str, body: RenameBody):
    db = get_db()
    cur = db.execute(
        "UPDATE meetings SET title=? WHERE id=?", (body.title.strip(), meeting_id)
    )
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"ok": True}


@router.delete("/{meeting_id}")
def delete_meeting(meeting_id: str):
    db = get_db()
    cur = db.execute("DELETE FROM meetings WHERE id=?", (meeting_id,))
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"ok": True}


@router.post("/{meeting_id}/share")
def create_share(meeting_id: str):
    """Mint a read-only share token (30-day expiry) for this meeting."""
    db = get_db()
    if not db.execute("SELECT 1 FROM meetings WHERE id=?", (meeting_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Meeting not found")
    token = _secrets.token_urlsafe(16)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=30)
    db.execute(
        "INSERT INTO shares(id,meeting_id,token,created_at,expires_at) VALUES(?,?,?,?,?)",
        (new_id(), meeting_id, token, now.isoformat(), expires.isoformat()),
    )
    db.commit()
    return {
        "share_url": f"aguacate://share/{token}",
        "token": token,
        "expires_at": expires.isoformat(),
    }


@router.post("/{meeting_id}/regenerate")
def regenerate(meeting_id: str, body: RegenerateBody | None = None):
    db = get_db()
    if not db.execute("SELECT 1 FROM meetings WHERE id=?", (meeting_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Meeting not found")
    pipeline.regenerate_notes_async(
        meeting_id, template_id=body.template_id if body else None
    )
    return {"ok": True}


@router.post("/{meeting_id}/followup")
def compose_followup(meeting_id: str, body: FollowupBody):
    """Smart Follow-up Composer: Claude drafts the email from the notes."""
    from ..services.ai import compose_followup as compose

    try:
        draft = compose(meeting_id, body.tone)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    db = get_db()
    row = db.execute(
        "SELECT attendees FROM meetings WHERE id=?", (meeting_id,)
    ).fetchone()
    attendees = json.loads(row["attendees"]) if row else []
    return {**draft, "attendees": attendees}


@router.post("/{meeting_id}/followup/sent")
def mark_followup_sent(meeting_id: str):
    db = get_db()
    cur = db.execute(
        "UPDATE meetings SET followup_sent=1 WHERE id=?", (meeting_id,)
    )
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"ok": True}
