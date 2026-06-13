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
) -> None:
    token = x_aguacate_token
    if token is None and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not _check(token):
        raise HTTPException(status_code=401, detail="Unauthorized")


def check_ws_auth(ws: WebSocket) -> bool:
    """Token as query param + Origin validation before accept() (C2)."""
    from .config import ALLOWED_ORIGINS

    token = ws.query_params.get("token")
    origin = ws.headers.get("origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        return False
    return _check(token)
