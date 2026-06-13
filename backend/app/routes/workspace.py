"""Team workspace routes: create, join, share meetings."""
import json
import logging
import os
import secrets
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import get_db, get_setting, new_id, now_iso, row_to_dict

log = logging.getLogger("aguacate.workspace")

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

WORKSPACE_DIR = Path.home() / "Aguacate" / "workspace"

# Polling thread for incoming shared meetings from network folder
_poll_thread: threading.Thread | None = None
_poll_stop = threading.Event()


def _ensure_workspace_dir(workspace_id: str) -> Path:
    d = WORKSPACE_DIR / workspace_id / "meetings"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _install_id() -> str:
    """Stable per-installation identifier stored in settings."""
    db = get_db()
    iid = get_setting("install_id")
    if not iid:
        iid = new_id()
        db.execute(
            "INSERT INTO settings(key,value) VALUES('install_id',?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (json.dumps(iid),),
        )
        db.commit()
    return iid


def _start_poll(workspace_id: str) -> None:
    global _poll_thread, _poll_stop
    if _poll_thread and _poll_thread.is_alive():
        return
    _poll_stop.clear()

    def _run():
        import time
        while not _poll_stop.wait(60):
            try:
                _sync_incoming(workspace_id)
            except Exception as exc:
                log.debug("Workspace sync failed: %s", exc)

    _poll_thread = threading.Thread(target=_run, daemon=True)
    _poll_thread.start()


def _sync_incoming(workspace_id: str) -> None:
    """Import meeting JSON files written by other workspace members."""
    share_path = get_setting("workspace_share_path")
    if not share_path:
        return
    incoming_dir = Path(share_path) / workspace_id / "meetings"
    if not incoming_dir.exists():
        return
    db = get_db()
    for json_file in incoming_dir.glob("*.json"):
        meeting_id = json_file.stem
        # Skip meetings we already have
        if db.execute("SELECT 1 FROM meetings WHERE id=?", (meeting_id,)).fetchone():
            continue
        try:
            with open(json_file) as f:
                data = json.load(f)
            db.execute(
                "INSERT OR IGNORE INTO meetings(id,title,started_at,status,attendees,workspace_id) "
                "VALUES(?,?,?,?,?,?)",
                (
                    data["id"],
                    data.get("title", "Shared meeting"),
                    data.get("started_at", now_iso()),
                    "ready",
                    json.dumps(data.get("attendees", [])),
                    workspace_id,
                ),
            )
            if data.get("notes"):
                from ..services import notes as notes_svc
                sections = notes_svc.split_sections(data["notes"])
                db.execute(
                    "INSERT OR IGNORE INTO notes(meeting_id,content,sections,generated_at) "
                    "VALUES(?,?,?,?)",
                    (data["id"], data["notes"], json.dumps(sections), now_iso()),
                )
            db.commit()
            log.info("Imported shared meeting %s from workspace", meeting_id)
        except Exception as exc:
            log.warning("Failed to import %s: %s", json_file, exc)


class CreateWorkspaceBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    display_name: str = Field(default="", max_length=100)


class JoinWorkspaceBody(BaseModel):
    invite_code: str = Field(min_length=6, max_length=32)
    display_name: str = Field(default="", max_length=100)


class SharePathBody(BaseModel):
    path: str = Field(max_length=500)


@router.post("/create")
def create_workspace(body: CreateWorkspaceBody):
    db = get_db()
    # Only one workspace supported per installation
    existing = db.execute("SELECT * FROM workspaces LIMIT 1").fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="Already in a workspace. Leave it first.")
    workspace_id = new_id()
    invite_code = secrets.token_urlsafe(8)[:8].upper()
    install_id = _install_id()
    db.execute(
        "INSERT INTO workspaces(id,name,invite_code,created_at,owner_install_id) VALUES(?,?,?,?,?)",
        (workspace_id, body.name.strip(), invite_code, now_iso(), install_id),
    )
    db.execute(
        "INSERT INTO workspace_members(workspace_id,install_id,display_name,joined_at) VALUES(?,?,?,?)",
        (workspace_id, install_id, body.display_name.strip() or "Owner", now_iso()),
    )
    db.commit()
    _ensure_workspace_dir(workspace_id)
    _start_poll(workspace_id)
    return {"workspace_id": workspace_id, "invite_code": invite_code, "name": body.name}


@router.post("/join")
def join_workspace(body: JoinWorkspaceBody):
    db = get_db()
    ws = db.execute(
        "SELECT * FROM workspaces WHERE invite_code=?", (body.invite_code.upper(),)
    ).fetchone()
    if not ws:
        raise HTTPException(status_code=404, detail="Invite code not found")
    install_id = _install_id()
    db.execute(
        "INSERT OR IGNORE INTO workspace_members(workspace_id,install_id,display_name,joined_at) "
        "VALUES(?,?,?,?)",
        (ws["id"], install_id, body.display_name.strip() or "Member", now_iso()),
    )
    db.commit()
    _start_poll(ws["id"])
    return {"workspace_id": ws["id"], "name": ws["name"]}


@router.get("")
def get_workspace():
    db = get_db()
    ws = db.execute("SELECT * FROM workspaces LIMIT 1").fetchone()
    if not ws:
        return {"workspace": None}
    members = db.execute(
        "SELECT * FROM workspace_members WHERE workspace_id=?", (ws["id"],)
    ).fetchall()
    share_path = get_setting("workspace_share_path", "")
    return {
        "workspace": {
            "id": ws["id"],
            "name": ws["name"],
            "invite_code": ws["invite_code"],
            "created_at": ws["created_at"],
            "share_path": share_path,
        },
        "members": [dict(m) for m in members],
    }


@router.get("/meetings")
def workspace_meetings():
    db = get_db()
    ws = db.execute("SELECT id FROM workspaces LIMIT 1").fetchone()
    if not ws:
        return []
    rows = db.execute(
        "SELECT * FROM meetings WHERE workspace_id=? ORDER BY started_at DESC",
        (ws["id"],),
    ).fetchall()
    return [row_to_dict(r) for r in rows]


@router.post("/share-path")
def set_share_path(body: SharePathBody):
    """Configure the shared folder path for workspace sync."""
    from ..db import set_setting
    set_setting("workspace_share_path", body.path.strip())
    return {"ok": True}


@router.post("/leave")
def leave_workspace():
    db = get_db()
    ws = db.execute("SELECT * FROM workspaces LIMIT 1").fetchone()
    if not ws:
        raise HTTPException(status_code=404, detail="Not in a workspace")
    install_id = _install_id()
    db.execute(
        "DELETE FROM workspace_members WHERE workspace_id=? AND install_id=?",
        (ws["id"], install_id),
    )
    # If owner leaves, delete the whole workspace record
    if ws["owner_install_id"] == install_id:
        db.execute("DELETE FROM workspaces WHERE id=?", (ws["id"],))
    db.commit()
    _poll_stop.set()
    return {"ok": True}


def share_meeting_to_workspace(meeting_id: str) -> dict:
    """Export meeting as JSON to the shared folder so teammates can import it."""
    db = get_db()
    ws = db.execute("SELECT * FROM workspaces LIMIT 1").fetchone()
    if not ws:
        raise RuntimeError("Not in a workspace")

    meeting = db.execute("SELECT * FROM meetings WHERE id=?", (meeting_id,)).fetchone()
    if not meeting:
        raise RuntimeError("Meeting not found")

    note = db.execute(
        "SELECT content FROM notes WHERE meeting_id=?", (meeting_id,)
    ).fetchone()

    db.execute(
        "UPDATE meetings SET workspace_id=? WHERE id=?", (ws["id"], meeting_id)
    )
    db.commit()

    payload = {
        "id": meeting_id,
        "title": meeting["title"],
        "started_at": meeting["started_at"],
        "attendees": json.loads(meeting["attendees"] or "[]"),
        "notes": note["content"] if note else "",
        "workspace_id": ws["id"],
    }

    share_path = get_setting("workspace_share_path")
    if share_path:
        out_dir = Path(share_path) / ws["id"] / "meetings"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"{meeting_id}.json"
        with open(out_file, "w") as f:
            json.dump(payload, f)

    return {"ok": True, "workspace_id": ws["id"]}
