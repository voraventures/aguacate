"""System-level detection: active video-call processes."""
import logging
import re
import subprocess
from datetime import datetime, timezone

from fastapi import APIRouter

log = logging.getLogger("aguacate.system")

router = APIRouter(prefix="/api/system", tags=["system"])

# Map of grep pattern -> friendly app name
CALL_APPS = {
    "zoom.us": "Zoom",
    "microsoft teams": "Microsoft Teams",
    "google meet": "Google Meet",
    "webexmeetings": "Webex",
    "/slack.app": "Slack",
    "whereby": "Whereby",
    "/discord.app": "Discord",
}

TEAMS_AUDIO_LSOF_PATTERNS = (
    r"audio",
    r"coreaudio",
    r"\bmicrophone\b",
    r"\bmic\b",
)
TEAMS_CPU_ACTIVE_THRESHOLD = 8.0


def _ps_line_pids(lines):
    """Extract process IDs from `ps aux` rows."""
    pids = []
    for line in lines:
        columns = line.split(None, 10)
        if len(columns) > 1 and columns[1].isdigit():
            pids.append(columns[1])
    return pids


def _teams_has_audio_activity(pids):
    """Return whether Teams has active audio-related resources open on macOS."""
    if not pids:
        return False

    try:
        result = subprocess.run(
            ["lsof", "-nP", "-p", ",".join(pids)],
            capture_output=True,
            text=True,
            timeout=2,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False

    lsof_output = f"{result.stdout}\n{result.stderr}".lower()
    return any(re.search(pattern, lsof_output) for pattern in TEAMS_AUDIO_LSOF_PATTERNS)


def _teams_has_elevated_cpu(lines):
    """Use Teams CPU activity as a fallback signal when audio resources are hidden."""
    for line in lines:
        columns = line.split(None, 10)
        if len(columns) <= 2:
            continue

        try:
            cpu_percent = float(columns[2])
        except ValueError:
            continue

        if cpu_percent >= TEAMS_CPU_ACTIVE_THRESHOLD:
            return True

    return False


def _is_active_teams_call(lines):
    """Confirm Teams is likely in a call instead of merely running idle."""
    pids = _ps_line_pids(lines)
    return _teams_has_audio_activity(pids) or _teams_has_elevated_cpu(lines)


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
                    if friendly_name == "Microsoft Teams" and not _is_active_teams_call(lines):
                        continue

                    seen.add(friendly_name)
                    detected.append({
                        "app": friendly_name,
                        "process": pattern,
                        "detected_at": now,
                    })
    except Exception as exc:
        log.warning("Active-call detection failed: %s", exc)

    return {"active_calls": detected}
