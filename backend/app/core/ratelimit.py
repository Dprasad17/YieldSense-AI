"""In-memory sliding-window limiter for failed sign-ins, keyed by (client IP, username)."""
import threading
import time
from collections import defaultdict, deque

from backend.app.core.config import settings


class LoginRateLimiter:
    def __init__(self) -> None:
        self._failures: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: tuple[str, str], now: float) -> deque[float]:
        q = self._failures[key]
        while q and now - q[0] > settings.LOGIN_WINDOW_SECONDS:
            q.popleft()
        return q

    def retry_after(self, ip: str, username: str) -> int:
        """Seconds until another attempt is allowed; 0 when not limited."""
        key = (ip, username.lower())
        now = time.monotonic()
        with self._lock:
            q = self._prune(key, now)
            if len(q) < settings.LOGIN_MAX_FAILURES:
                return 0
            return max(1, int(settings.LOGIN_WINDOW_SECONDS - (now - q[0])) + 1)

    def record_failure(self, ip: str, username: str) -> None:
        with self._lock:
            self._failures[(ip, username.lower())].append(time.monotonic())

    def reset(self, ip: str | None = None, username: str | None = None) -> None:
        with self._lock:
            if ip is None:
                self._failures.clear()
            else:
                self._failures.pop((ip, (username or "").lower()), None)


login_limiter = LoginRateLimiter()


class ApiRateLimiter:
    """Token bucket per client for the whole API: `RATE_LIMIT_PER_MINUTE` requests a minute with bursts up
    to the same number. The client is the signed-in user (bearer token) or, without a token, the IP.
    0 disables the limit. In-memory, so each API worker counts separately."""

    def __init__(self) -> None:
        self._buckets: dict[str, tuple[float, float]] = {}
        self._lock = threading.Lock()

    def take(self, key: str) -> int:
        """Spends one token; returns 0 when allowed, otherwise the seconds to wait."""
        limit = settings.RATE_LIMIT_PER_MINUTE
        if limit <= 0:
            return 0
        rate = limit / 60.0
        now = time.monotonic()
        with self._lock:
            tokens, last = self._buckets.get(key, (float(limit), now))
            tokens = min(float(limit), tokens + (now - last) * rate)
            if tokens < 1.0:
                self._buckets[key] = (tokens, now)
                return max(1, int((1.0 - tokens) / rate) + 1)
            self._buckets[key] = (tokens - 1.0, now)
            if len(self._buckets) > 50_000:  # drop idle clients
                self._buckets = {k: v for k, v in self._buckets.items() if now - v[1] < 600}
            return 0

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


api_limiter = ApiRateLimiter()
