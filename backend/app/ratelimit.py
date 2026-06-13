"""In-memory token-bucket rate limiting (C7). Single local user, so per-path buckets."""
import time
from collections import defaultdict

from fastapi import HTTPException, Request

# path-prefix -> (capacity, refill_per_second)
LIMITS = [
    ("/api/license", (5, 5 / 60)),        # 5/min: license refresh is remote
    ("/api/recording/start", (6, 6 / 60)),
    ("/api/calendar/sync", (10, 10 / 60)),
    ("/api/notes/generate", (10, 10 / 60)),
    ("/api/integrations", (20, 20 / 60)),
    ("/api", (240, 240 / 60)),             # general ceiling 240/min
]


class _Bucket:
    __slots__ = ("tokens", "capacity", "rate", "updated")

    def __init__(self, capacity: float, rate: float):
        self.tokens = capacity
        self.capacity = capacity
        self.rate = rate
        self.updated = time.monotonic()

    def take(self) -> bool:
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


_buckets: dict[str, _Bucket] = {}


def check_rate_limit(request: Request) -> None:
    path = request.url.path
    for prefix, (cap, rate) in LIMITS:
        if path.startswith(prefix):
            bucket = _buckets.get(prefix)
            if bucket is None:
                bucket = _buckets[prefix] = _Bucket(cap, rate)
            if not bucket.take():
                raise HTTPException(status_code=429, detail="Rate limit exceeded")
            if prefix != "/api":
                # also consume from the general ceiling
                continue
            return
