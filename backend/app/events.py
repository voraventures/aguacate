"""WebSocket event hub: broadcasts backend state to the renderer."""
import asyncio
import json
import logging

from fastapi import WebSocket

log = logging.getLogger("aguacate.events")


class EventHub:
    def __init__(self):
        self._clients: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.discard(ws)

    async def broadcast(self, event: str, data: dict | None = None) -> None:
        message = json.dumps({"event": event, "data": data or {}})
        dead = []
        for ws in self._clients:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)

    def emit(self, event: str, data: dict | None = None) -> None:
        """Thread-safe emit from worker threads (recorder, transcriber, pollers)."""
        if self._loop is None or self._loop.is_closed():
            return
        asyncio.run_coroutine_threadsafe(self.broadcast(event, data), self._loop)


hub = EventHub()
