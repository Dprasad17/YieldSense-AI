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
