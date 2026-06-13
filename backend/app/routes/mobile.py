"""Mobile companion API — iOS-ready endpoints.

All mutating endpoints require the X-Mobile-Token header obtained from POST /api/mobile/auth.
The mobile token is separate from the per-launch desktop token.
"""
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..db import get_db, new_id, now_iso, row_to_dict

log = logging.getLogger("aguacate.mobile")

router = APIRouter(prefix="/api/mobile", tags=["mobile"])


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def _check_mobile_token(request: Request):
    token = request.headers.get("X-Mobile-Token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing X-Mobile-Token header")
    db = get_db()
    row = db.execute(
        "SELECT * FROM mobile_sessions WHERE mobile_token=? AND revoked=0",
        (token,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or revoked mobile token")
    if datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Mobile token expired")
    return row


mobile_authed = [Depends(_check_mobile_token)]


class AuthBody(BaseModel):
    device_id: str = Field(min_length=1, max_length=200)
    device_name: str = Field(default="", max_length=200)


class ActionUpdateBody(BaseModel):
    status: str = Field(pattern="^(open|done)$")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/auth")
def mobile_auth(body: AuthBody):
    """Issue a 30-day mobile token for a device."""
    db = get_db()
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=30)
    session_id = new_id()
    db.execute(
        "INSERT INTO mobile_sessions(id,mobile_token,device_id,device_name,created_at,expires_at) "
        "VALUES(?,?,?,?,?,?)",
        (
            session_id,
            token,
            body.device_id[:200],
            body.device_name[:200],
            now.isoformat(),
            expires.isoformat(),
        ),
    )
    db.commit()
    return {
        "mobile_token": token,
        "session_id": session_id,
        "expires_at": expires.isoformat(),
    }


@router.get("/sessions")
def list_mobile_sessions():
    """List all connected mobile sessions (for revocation UI)."""
    db = get_db()
    rows = db.execute(
        "SELECT id, device_name, device_id, created_at, expires_at, revoked "
        "FROM mobile_sessions ORDER BY created_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("/sessions/{session_id}/revoke")
def revoke_session(session_id: str):
    db = get_db()
    cur = db.execute(
        "UPDATE mobile_sessions SET revoked=1 WHERE id=?", (session_id,)
    )
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.get("/meetings", dependencies=mobile_authed)
def mobile_meetings():
    """Minimal meeting list for mobile."""
    db = get_db()
    rows = db.execute(
        """SELECT m.id, m.title, m.started_at, m.status,
             (SELECT COUNT(*) FROM action_items a WHERE a.meeting_id=m.id AND a.status='open') AS action_count,
             (SELECT COUNT(*) FROM decisions d WHERE d.meeting_id=m.id) AS decision_count
           FROM meetings m ORDER BY m.started_at DESC LIMIT 100"""
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/meetings/{meeting_id}", dependencies=mobile_authed)
def mobile_meeting_detail(meeting_id: str):
    """Full meeting detail for mobile."""
    db = get_db()
    row = db.execute("SELECT * FROM meetings WHERE id=?", (meeting_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Meeting not found")
    meeting = row_to_dict(row)
    note = db.execute(
        "SELECT content FROM notes WHERE meeting_id=?", (meeting_id,)
    ).fetchone()
    meeting["notes"] = note["content"] if note else None
    actions = db.execute(
        "SELECT id, owner, action, due, status FROM action_items WHERE meeting_id=?",
        (meeting_id,),
    ).fetchall()
    meeting["actions"] = [dict(a) for a in actions]
    return meeting


@router.get("/actions", dependencies=mobile_authed)
def mobile_actions():
    """All open actions across meetings."""
    db = get_db()
    rows = db.execute(
        """SELECT a.id, a.meeting_id, a.owner, a.action, a.due, a.status,
                  m.title AS meeting_title
           FROM action_items a JOIN meetings m ON m.id=a.meeting_id
           WHERE a.status='open' ORDER BY a.meeting_id DESC"""
    ).fetchall()
    return [dict(r) for r in rows]


@router.patch("/actions/{action_id}", dependencies=mobile_authed)
def mobile_update_action(action_id: str, body: ActionUpdateBody):
    db = get_db()
    completed_at = now_iso() if body.status == "done" else None
    cur = db.execute(
        "UPDATE action_items SET status=?, completed_at=? WHERE id=?",
        (body.status, completed_at, action_id),
    )
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"ok": True}


@router.get("/search", dependencies=mobile_authed)
def mobile_search(q: str = Query(min_length=1, max_length=200)):
    """Full-text search for mobile."""
    like = f"%{q}%"
    db = get_db()
    rows = db.execute(
        """SELECT DISTINCT m.id, m.title, m.started_at,
                  COALESCE(n.content, '') AS notes_excerpt
           FROM meetings m
           LEFT JOIN notes n ON n.meeting_id = m.id
           LEFT JOIN transcripts t ON t.meeting_id = m.id
           WHERE m.title LIKE ? OR n.content LIKE ? OR t.text LIKE ?
           ORDER BY m.started_at DESC LIMIT 30""",
        (like, like, like),
    ).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        # Return a short excerpt around the match
        excerpt = d.pop("notes_excerpt", "") or ""
        idx = excerpt.lower().find(q.lower())
        if idx >= 0:
            start = max(0, idx - 80)
            d["excerpt"] = "…" + excerpt[start:idx + 120].strip() + "…"
        results.append(d)
    return results
