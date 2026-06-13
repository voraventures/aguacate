"""Aguacate backend launcher.

Binds to a free loopback port, then prints a single JSON handshake line to
stdout so the Electron main process can read {port, token}. The token is never
written to disk (C2).
"""
import json
import socket
import sys

import uvicorn

from app.auth import SESSION_TOKEN
from app.main import create_app


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else find_free_port()
    app = create_app()

    print(
        json.dumps({"event": "ready", "port": port, "token": SESSION_TOKEN}),
        flush=True,
    )
    # access_log=False: WS auth token travels as a query param and must never
    # appear in request logs (C2).
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
