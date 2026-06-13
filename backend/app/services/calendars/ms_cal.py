"""Microsoft Calendar via OAuth device-code flow (public client, PKCE-class — no secret).

Requires user-supplied client_id (Azure app registration) in credentials.json.
Tokens stored in the OS keychain.
"""
import json
import logging
import threading
import time

import httpx

from ...config import load_oauth_credentials
from ...events import hub

log = logging.getLogger("aguacate.mscal")

AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0"
SCOPES = "Calendars.Read offline_access"

try:
    import keyring
except Exception:  # pragma: no cover
    keyring = None

_KC = "Aguacate"


def _save_tokens(tokens: dict) -> None:
    if keyring:
        keyring.set_password(_KC, "ms_oauth_tokens", json.dumps(tokens))


def _load_tokens() -> dict | None:
    if keyring:
        raw = keyring.get_password(_KC, "ms_oauth_tokens")
        if raw:
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return None
    return None


def clear_tokens() -> None:
    if keyring:
        try:
            keyring.delete_password(_KC, "ms_oauth_tokens")
        except Exception:
            pass


def client_id() -> str | None:
    return load_oauth_credentials().get("microsoft", {}).get("client_id")


def is_connected() -> bool:
    return _load_tokens() is not None


def start_device_flow() -> dict:
    """Begin device-code auth; polls in background, emits ws events on completion."""
    cid = client_id()
    if not cid:
        raise RuntimeError(
            "Microsoft client_id not configured — add credentials.json (see credentials.example.json)"
        )
    resp = httpx.post(
        f"{AUTHORITY}/devicecode",
        data={"client_id": cid, "scope": SCOPES},
        timeout=15,
    )
    resp.raise_for_status()
    flow = resp.json()

    def poll():
        interval = flow.get("interval", 5)
        deadline = time.time() + flow.get("expires_in", 900)
        while time.time() < deadline:
            time.sleep(interval)
            tok = httpx.post(
                f"{AUTHORITY}/token",
                data={
                    "client_id": cid,
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    "device_code": flow["device_code"],
                },
                timeout=15,
            )
            body = tok.json()
            if tok.status_code == 200:
                body["expires_at"] = time.time() + body.get("expires_in", 3600) - 60
                _save_tokens(body)
                hub.emit("ms_connected", {})
                return
            if body.get("error") not in ("authorization_pending", "slow_down"):
                hub.emit("ms_connect_failed", {"reason": body.get("error", "unknown")})
                return
        hub.emit("ms_connect_failed", {"reason": "timeout"})

    threading.Thread(target=poll, daemon=True).start()
    return {
        "verification_uri": flow.get("verification_uri"),
        "user_code": flow.get("user_code"),
        "expires_in": flow.get("expires_in"),
    }


def get_access_token() -> str | None:
    tokens = _load_tokens()
    if not tokens:
        return None
    if time.time() < tokens.get("expires_at", 0):
        return tokens["access_token"]
    refresh = tokens.get("refresh_token")
    if not refresh:
        return None
    try:
        resp = httpx.post(
            f"{AUTHORITY}/token",
            data={
                "client_id": client_id(),
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "scope": SCOPES,
            },
            timeout=15,
        )
        resp.raise_for_status()
        fresh = resp.json()
        fresh["expires_at"] = time.time() + fresh.get("expires_in", 3600) - 60
        if "refresh_token" not in fresh:
            fresh["refresh_token"] = refresh
        _save_tokens(fresh)
        return fresh["access_token"]
    except httpx.HTTPError as exc:
        log.warning("MS token refresh failed: %s", exc)
        return None


def fetch_events(time_min_iso: str, time_max_iso: str) -> list[dict]:
    token = get_access_token()
    if not token:
        return []
    try:
        resp = httpx.get(
            "https://graph.microsoft.com/v1.0/me/calendarView",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "startDateTime": time_min_iso,
                "endDateTime": time_max_iso,
                "$top": "50",
                "$orderby": "start/dateTime",
            },
            timeout=15,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        log.warning("MS events fetch failed: %s", exc)
        return []
    events = []
    for item in resp.json().get("value", []):
        start = item.get("start", {}).get("dateTime")
        if start and not start.endswith("Z") and "+" not in start:
            start += "Z"  # Graph returns UTC without zone marker by default
        end = item.get("end", {}).get("dateTime")
        if end and not end.endswith("Z") and "+" not in end:
            end += "Z"
        events.append(
            {
                "provider": "microsoft",
                "provider_id": item.get("id", ""),
                "title": item.get("subject", "Untitled event"),
                "start": start,
                "end": end,
                "attendees": [
                    a.get("emailAddress", {}).get("name", "")
                    for a in item.get("attendees", [])
                ],
                "cancelled": bool(item.get("isCancelled")),
            }
        )
    return events
