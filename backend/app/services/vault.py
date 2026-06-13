"""Encrypted Vault: your entire meeting corpus as one portable encrypted file.

Only a local-first product can offer this — the data is yours, take it with
you. AES-128-GCM via Fernet, key derived from the password with PBKDF2-SHA256
(600k iterations). Vault files are .aguavault and chmod 600.
"""
import base64
import io
import logging
import os
import tarfile
import time

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from ..config import DATA_DIR, DB_PATH, EXPORTS_DIR, NOTES_DIR, TRANSCRIPTS_DIR, secure_file

log = logging.getLogger("aguacate.vault")

MAGIC = b"AGUAVAULT1"
ITERATIONS = 600_000


def _derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode("utf-8")))


def export_vault(password: str, include_audio: bool = False) -> str:
    """Tar the corpus (DB, notes, transcripts; optionally audio) and encrypt."""
    if len(password) < 8:
        raise RuntimeError("Vault password must be at least 8 characters")

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        tar.add(DB_PATH, arcname="aguacate.db")
        for directory, name in ((NOTES_DIR, "notes"), (TRANSCRIPTS_DIR, "transcripts")):
            if directory.exists():
                tar.add(directory, arcname=name)
        if include_audio:
            recordings = DATA_DIR / "recordings"
            if recordings.exists():
                tar.add(recordings, arcname="recordings")

    salt = os.urandom(16)
    token = Fernet(_derive_key(password, salt)).encrypt(buf.getvalue())

    stamp = time.strftime("%Y-%m-%d")
    path = EXPORTS_DIR / f"aguacate-vault-{stamp}.aguavault"
    with open(path, "wb") as f:
        f.write(MAGIC + salt + token)
    secure_file(path)
    return str(path)


def import_vault(path: str, password: str) -> int:
    """Decrypt and restore a vault into the data directory. Existing files are
    overwritten; a restart is recommended afterwards. Returns file count."""
    from ..config import is_safe_managed_path

    with open(path, "rb") as f:
        raw = f.read()
    if not raw.startswith(MAGIC):
        raise RuntimeError("Not an Aguacate vault file")
    salt, token = raw[len(MAGIC) : len(MAGIC) + 16], raw[len(MAGIC) + 16 :]
    try:
        payload = Fernet(_derive_key(password, salt)).decrypt(token)
    except InvalidToken:
        raise RuntimeError("Wrong vault password")

    count = 0
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as tar:
        for member in tar.getmembers():
            target = DATA_DIR / member.name
            if not is_safe_managed_path(str(target)):
                continue  # path traversal defense
            tar.extract(member, DATA_DIR)
            if target.is_file():
                secure_file(target)
            count += 1
    return count
