"""Chrome native-messaging host: metadata only, never desktop API credentials."""
import json
import os
from pathlib import Path
import struct
import sys
import urllib.request

EXTENSION_ID = "hjifgailamaffpncpidoechbgfpkekjg"
MAX_MESSAGE = 16_384


def data_dir():
    # Match the backend's existing default; do not migrate Windows user data.
    default = Path.home() / "Library/Application Support/Aguacate"
    return Path(os.environ.get("AGUACATE_DATA_DIR", default))


def forward(message):
    action = message.get("action")
    if action not in ("state", "offer", "activity"):
        raise ValueError("Unknown operation")
    credentials = json.loads((data_dir() / "speaker-bridge.json").read_text())
    port = credentials["port"]
    if not isinstance(port, int) or not 1024 <= port <= 65535:
        raise ValueError("Invalid endpoint")
    payload = message.get("payload", {})
    if not isinstance(payload, dict):
        raise ValueError("Invalid payload")
    if action != "state":
        payload = {**payload, "source": "meet"}
    request = urllib.request.Request(f"http://127.0.0.1:{port}/speaker-bridge/{action}",
        data=None if action == "state" else json.dumps(payload).encode(),
        headers={"X-Speaker-Bridge": credentials["token"], "Content-Type": "application/json"})
    # Ignore system proxies for this loopback-only capability.
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=2) as response:
        return json.loads(response.read(MAX_MESSAGE))


def read_exact(stream, size):
    chunks = bytearray()
    while len(chunks) < size:
        part = stream.read(size - len(chunks))
        if not part:
            raise EOFError()
        chunks.extend(part)
    return bytes(chunks)


def main():
    if len(sys.argv) < 2 or sys.argv[1].rstrip("/") != f"chrome-extension://{EXTENSION_ID}":
        return 1
    if sys.platform == "win32":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    while True:
        try:
            length = struct.unpack("<I", read_exact(sys.stdin.buffer, 4))[0]
            if not 0 < length <= MAX_MESSAGE:
                return 1
            message = json.loads(read_exact(sys.stdin.buffer, length))
            request_id = message.get("id")
            if not isinstance(request_id, int):
                return 1
            try:
                result = {"id": request_id, "data": forward(message)}
            except Exception:
                result = {"id": request_id, "error": "unavailable"}
            encoded = json.dumps(result).encode()
            sys.stdout.buffer.write(struct.pack("<I", len(encoded)) + encoded)
            sys.stdout.buffer.flush()
        except EOFError:
            return 0
        except Exception:
            return 1


if __name__ == "__main__":
    sys.exit(main())
