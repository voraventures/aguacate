"""System-level detection: active video-call processes."""
import logging
import subprocess
from datetime import datetime, timezone

from fastapi import APIRouter

log = logging.getLogger("aguacate.system")

router = APIRouter(prefix="/api/system", tags=["system"])

# Map of grep pattern -> friendly app name
CALL_APPS = {
    "zoom.us": "Zoom",
    "teams": "Microsoft Teams",
    "google meet": "Google Meet",
    "webexmeetings": "Webex",
    "slack": "Slack",
    "whereby": "Whereby",
    "discord": "Discord",
}


@router.get("/active-calls")
def active_calls():
    """Return running video-call processes on this machine.

    Uses `ps aux` on macOS/Linux.  Safe: read-only, no user input in command.
    """
    detected = []
    try:
        result = subprocess.run(
            ["ps", "aux"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        ps_output = result.stdout.lower()

        now = datetime.now(timezone.utc).isoformat()
        seen = set()
        for pattern, friendly_name in CALL_APPS.items():
            if pattern in ps_output and friendly_name not in seen:
                # Exclude grep itself by checking that it's not just the grep process
                lines = [
                    line for line in result.stdout.splitlines()
                    if pattern.lower() in line.lower() and "grep" not in line.lower()
                ]
                if lines:
                    seen.add(friendly_name)
                    detected.append({
                        "app": friendly_name,
                        "process": pattern,
                        "detected_at": now,
                    })
    except Exception as exc:
        log.warning("Active-call detection failed: %s", exc)

    return {"active_calls": detected}
