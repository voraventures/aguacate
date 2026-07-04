"""Backend auth: a random per-launch token required on every route (C2)."""
import hmac
import secrets

from fastapi import Header, HTTPException, Query, WebSocket

SESSION_TOKEN = secrets.token_urlsafe(32)


def _check(token: str | None) -> bool:
    return token is not None and hmac.compare_digest(token, SESSION_TOKEN)


async def require_token(
    authorization: str | None = Header(default=None),
    x_aguacate_token: str | None = Header(default=None),
    # arg named auth_qs (not "token") so it never collides with routes that
    # have a {token} path param (share links); still read from ?token=
    auth_qs: str | None = Query(default=None, alias="token"),
) -> None:
    # ?token= exists for media elements (<audio src>) that cannot send headers —
    # same pattern as the WebSocket auth below.
    value = x_aguacate_token or auth_qs
    if value is None and authorization and authorization.startswith("Bearer "):
        value = authorization[7:]
    if not _check(value):
        raise HTTPException(status_code=401, detail="Unauthorized")


def check_ws_auth(ws: WebSocket) -> bool:
    """Token as query param + Origin validation before accept() (C2)."""
    from .config import ALLOWED_ORIGINS

    token = ws.query_params.get("token")
    origin = ws.headers.get("origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        return False
    return _check(token)
