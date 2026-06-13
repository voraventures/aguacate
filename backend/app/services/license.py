"""Free tier (5 lifetime meetings) + Pro license validated against remote server."""
import logging
import time

import httpx

from ..config import FREE_TIER_LIMIT, LICENSE_SERVER_URL, STRIPE_CHECKOUT_URL
from ..db import get_db, get_setting, set_setting
from .keychain import get_secret, set_secret

log = logging.getLogger("aguacate.license")

# Offline grace: a previously-validated license stays valid 72h without re-check.
OFFLINE_GRACE_SEC = 72 * 3600

# DEV ONLY: local development license — activates Pro indefinitely without
# ever contacting the license server. Never publish this key.
DEV_LICENSE_KEY = "AGUA-DEV-LOCAL-2026"


try:
    import keyring as _keyring
except Exception:  # pragma: no cover
    _keyring = None

_KC_SERVICE = "Aguacate"
_KC_COUNTER = "lifetime_meeting_counter"


def _keychain_counter() -> int:
    if _keyring is None:
        return 0
    try:
        raw = _keyring.get_password(_KC_SERVICE, _KC_COUNTER)
        return int(raw) if raw and raw.isdigit() else 0
    except Exception:
        return 0


def record_meeting_created() -> None:
    """Monotonic lifetime counter in the OS keychain — deleting the local DB
    cannot reset the free-tier allowance."""
    if _keyring is None:
        return
    try:
        _keyring.set_password(_KC_SERVICE, _KC_COUNTER, str(_keychain_counter() + 1))
    except Exception as exc:
        log.warning("Could not bump keychain meeting counter: %s", exc)


def meetings_used() -> int:
    db_count = get_db().execute("SELECT COUNT(*) c FROM meetings").fetchone()["c"]
    return max(db_count, _keychain_counter())


def status() -> dict:
    used = meetings_used()
    cached = get_setting("license_status", {})
    is_dev = bool(cached.get("dev"))  # DEV ONLY: no expiry, no grace window
    is_pro = is_dev or (
        bool(cached.get("valid"))
        and (time.time() - cached.get("checked_at", 0) < OFFLINE_GRACE_SEC)
    )
    return {
        "tier": "pro" if is_pro else "free",
        "plan_name": "Pro (Developer)" if is_dev else ("Pro" if is_pro else "Free"),
        "meetings_used": used,
        "free_limit": FREE_TIER_LIMIT,
        "remaining": max(0, FREE_TIER_LIMIT - used),
        "can_record": is_pro or used < FREE_TIER_LIMIT,
        "checkout_url": STRIPE_CHECKOUT_URL,
        "license_key_set": bool(get_secret("license_key")),
    }


def activate(license_key: str) -> dict:
    key = license_key.strip()
    set_secret("license_key", key)
    if key == DEV_LICENSE_KEY:  # DEV ONLY: bypass the remote server entirely
        set_setting("license_status", {"valid": True, "dev": True, "checked_at": time.time()})
        return status()
    return refresh()


def _reset_keychain_counter() -> None:  # DEV ONLY
    """DEV ONLY: zero the monotonic free-tier counter so usage resets."""
    if _keyring is None:
        return
    try:
        _keyring.set_password(_KC_SERVICE, _KC_COUNTER, "0")
    except Exception as exc:
        log.warning("Could not reset keychain meeting counter: %s", exc)


def set_tier(tier: str) -> dict:  # DEV ONLY
    """DEV ONLY: flip local license state between free and pro without touching
    the license server. 'pro' mirrors the AGUA-DEV-LOCAL-2026 bypass; 'free'
    clears the cached license and resets the usage counter."""
    if tier == "pro":
        set_setting("license_status", {"valid": True, "dev": True, "checked_at": time.time()})
    else:
        set_setting("license_status", {"valid": False, "checked_at": time.time()})
        _reset_keychain_counter()
    return status()


def refresh() -> dict:
    """Validate the stored license key against the license server."""
    key = get_secret("license_key")
    if not key:
        set_setting("license_status", {"valid": False, "checked_at": time.time()})
        return status()
    if key == DEV_LICENSE_KEY:  # DEV ONLY: dev license never re-validates remotely
        set_setting("license_status", {"valid": True, "dev": True, "checked_at": time.time()})
        return status()
    try:
        resp = httpx.post(
            f"{LICENSE_SERVER_URL}/validate",
            json={"license_key": key, "product": "aguacate-pro"},
            timeout=10,
        )
        valid = resp.status_code == 200 and resp.json().get("valid") is True
        set_setting("license_status", {"valid": valid, "checked_at": time.time()})
    except httpx.HTTPError as exc:
        log.warning("License server unreachable: %s", exc)
        # keep previous cached status (offline grace handled in status())
    return status()
