"""Cross-meeting intelligence routes."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import get_db, now_iso
from ..services import intelligence

router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])


class ActionUpdate(BaseModel):
    owner: str | None = Field(default=None, max_length=120)
    status: str | None = Field(default=None, pattern="^(open|done)$")
    completed_at: str | None = Field(default=None, max_length=64)


@router.get("/actions")
def actions():
    return intelligence.aggregate_actions()


@router.get("/decisions")
def decisions():
    return intelligence.aggregate_decisions()


@router.get("/topics")
def topics():
    return intelligence.aggregate_topics()


@router.get("/people")
def people():
    return intelligence.aggregate_people()


@router.get("/my-work")
def my_work():
    return intelligence.my_work_summary()


@router.get("/series")
def series():
    """Recurring Meeting Intelligence: grouped series with trends."""
    return intelligence.detect_series()


@router.get("/pulse")
def pulse():
    """Action Pulse: stale actions + actions owned by people you meet today."""
    return intelligence.action_pulse()


class ConflictResolve(BaseModel):
    resolution: str = Field(pattern="^(superseded|reviewed)$")


@router.patch("/conflicts/{conflict_id}")
def resolve_conflict_route(conflict_id: str, body: ConflictResolve):
    from ..services.conflicts import resolve_conflict

    if not resolve_conflict(conflict_id, body.resolution):
        raise HTTPException(status_code=404, detail="Conflict not found")
    return {"ok": True}


@router.patch("/actions/{action_id}")
def update_action(action_id: str, body: ActionUpdate):
    db = get_db()
    row = db.execute("SELECT * FROM action_items WHERE id=?", (action_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Action not found")
    owner = body.owner.strip() if body.owner is not None else row["owner"]
    status = body.status or row["status"]
    # Track completion time: set when moving to done, clear when reopened.
    completed_at = row["completed_at"] if "completed_at" in row.keys() else None
    if body.status == "done":
        completed_at = body.completed_at or now_iso()
    elif body.status == "open":
        completed_at = None
    db.execute(
        "UPDATE action_items SET owner=?, status=?, completed_at=? WHERE id=?",
        (owner or "TBD", status, completed_at, action_id),
    )
    db.commit()
    return {"ok": True, "owner": owner or "TBD", "status": status, "completed_at": completed_at}
