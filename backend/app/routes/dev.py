# DEV ONLY: developer-testing endpoints. This router is registered only when
# config.DEV_MODE is true (see main.create_app), so it is never reachable in a
# packaged production build.
"""DEV ONLY: tier switching and other local testing helpers."""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services import license as license_svc

router = APIRouter(prefix="/api/dev", tags=["dev"])  # DEV ONLY


class SetTierBody(BaseModel):  # DEV ONLY
    tier: str = Field(pattern="^(free|pro)$")


@router.post("/set-tier")  # DEV ONLY
def set_tier(body: SetTierBody):
    """DEV ONLY: set the local license tier to 'free' or 'pro' immediately."""
    return license_svc.set_tier(body.tier)
