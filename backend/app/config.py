"""Paths, data-directory setup, and runtime configuration for Aguacate."""
import json
import os
import stat
from pathlib import Path

APP_NAME = "Aguacate"

DATA_DIR = Path(
    os.environ.get(
        "AGUACATE_DATA_DIR",
        Path.home() / "Library" / "Application Support" / APP_NAME,
    )
)
RECORDINGS_DIR = DATA_DIR / "recordings"
TRANSCRIPTS_DIR = DATA_DIR / "transcripts"
NOTES_DIR = DATA_DIR / "notes"
EXPORTS_DIR = DATA_DIR / "exports"
LOGS_DIR = DATA_DIR / "logs"
DB_PATH = DATA_DIR / "aguacate.db"

# Origins allowed to talk to the backend. Dev server + packaged custom protocol.
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "app://aguacate",
    "aguacate-ios://app",  # Mobile companion app
]
# Host headers we accept (DNS-rebinding defense). Port is appended at startup.
ALLOWED_HOSTS = {"127.0.0.1", "localhost"}

CLAUDE_MODEL = os.environ.get("AGUACATE_CLAUDE_MODEL", "claude-sonnet-4-6")
DEFAULT_AI_PROVIDER = os.environ.get("AGUACATE_AI_PROVIDER", "anthropic")
DEFAULT_OPENAI_MODEL = os.environ.get("AGUACATE_OPENAI_MODEL", "gpt-4o")
DEFAULT_GEMINI_MODEL = os.environ.get("AGUACATE_GEMINI_MODEL", "gemini-2.0-flash")
WHISPER_MODEL = os.environ.get("AGUACATE_WHISPER_MODEL", "base")
LICENSE_SERVER_URL = os.environ.get(
    "AGUACATE_LICENSE_SERVER", "https://license.aguacatenotes.com/api"
)
STRIPE_CHECKOUT_URL = os.environ.get(
    "AGUACATE_CHECKOUT_URL", "https://buy.stripe.com/cNieVf0mZ0iN7ml6AL6sw04"
)
FREE_TIER_LIMIT = 5

# DEV ONLY: gates developer-testing endpoints (e.g. /api/dev/set-tier). True when
# DEV_MODE=true, when Electron passes AGUACATE_DEV=1 (unpackaged), or when
# NODE_ENV is set to anything other than production. Packaged builds leave NODE_ENV
# unset (-> "production") and set AGUACATE_DEV=0, so this stays False in production.
DEV_MODE = (
    os.environ.get("DEV_MODE", "").lower() == "true"
    or os.environ.get("AGUACATE_DEV") == "1"
    or os.environ.get("NODE_ENV", "production").lower() not in ("production", "prod")
)

# OAuth client config is user-supplied (never bundled). See credentials.example.json.
CREDENTIALS_PATH = DATA_DIR / "credentials.json"

# Default public OAuth client_id (PKCE flow — no secret). Used when credentials.json
# does not supply one; credentials.json still overrides this for backward compatibility.
GOOGLE_CLIENT_ID = "316282714383-kb5kqhih133lmkq39npqu1lire5n1kdb.apps.googleusercontent.com"


def _secure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    os.chmod(path, stat.S_IRWXU)  # 700


def ensure_dirs() -> None:
    for d in (DATA_DIR, RECORDINGS_DIR, TRANSCRIPTS_DIR, NOTES_DIR, EXPORTS_DIR, LOGS_DIR):
        _secure_dir(d)


def secure_file(path: Path) -> None:
    """chmod 600 a file we just created."""
    if path.exists():
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)


def touch_secure(path: Path) -> None:
    """Create (or truncate-safe touch) a file with 0600 atomically, so it never
    exists with default-umask permissions (C5)."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT, 0o600)
    os.close(fd)
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)  # in case it pre-existed


def write_secure_text(path: Path, text: str) -> None:
    """Write text to a file that is 0600 from the instant it exists."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)


def load_oauth_credentials() -> dict:
    """Load user-supplied OAuth client config (public client IDs only, PKCE flow)."""
    if CREDENTIALS_PATH.exists():
        try:
            with open(CREDENTIALS_PATH) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def is_safe_managed_path(path: str) -> bool:
    """True only if path resolves inside our data directory (no traversal)."""
    try:
        resolved = Path(path).resolve()
        return resolved.is_relative_to(DATA_DIR.resolve())
    except (OSError, ValueError):
        return False
