"""
Request IDs, timing and structured (JSON) logs for every API call, plus the rolling
latency metrics behind GET /api/admin/metrics.
"""
import json
import logging
import re
import sys
import time
import uuid
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from threading import Lock

import numpy as np
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

REQUEST_ID_HEADER = "X-Request-ID"
_VALID_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
STARTED_AT = time.time()


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        entry.update(getattr(record, "fields", {}))
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def get_logger() -> logging.Logger:
    logger = logging.getLogger("yieldsense")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger


log = get_logger()


class ApiMetrics:
    """Rolling window of request durations, overall and per route template."""

    def __init__(self, size: int = 5000, per_route: int = 500):
        self._lock = Lock()
        self._all: deque[float] = deque(maxlen=size)
        self._routes: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=per_route))
        self._counts: Counter[str] = Counter()
        self._status: Counter[str] = Counter()
        self.total = 0

    def add(self, route: str, status: int, ms: float) -> None:
        with self._lock:
            self.total += 1
            self._all.append(ms)
            self._routes[route].append(ms)
            self._counts[route] += 1
            self._status[f"{status // 100}xx"] += 1

    @staticmethod
    def _pct(values) -> dict:
        if not values:
            return {"count": 0, "p50_ms": None, "p95_ms": None}
        arr = np.fromiter(values, dtype=float)
        return {"count": int(arr.size), "p50_ms": round(float(np.percentile(arr, 50)), 2), "p95_ms": round(float(np.percentile(arr, 95)), 2)}

    def summary(self, top: int = 12) -> dict:
        with self._lock:
            overall = self._pct(list(self._all))
            routes = [
                {"route": r, "requests": n, **self._pct(list(self._routes[r]))}
                for r, n in self._counts.most_common(top)
            ]
            status = dict(self._status)
            total = self.total
        return {"requests_total": total, "status": status, "overall": overall, "routes": routes}


api_metrics = ApiMetrics()


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns a request ID (or keeps a well-formed incoming one), times the request,
    returns X-Request-ID and Server-Timing headers, and writes one JSON log line."""

    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get(REQUEST_ID_HEADER, "")
        request_id = incoming if _VALID_ID.match(incoming) else uuid.uuid4().hex
        request.state.request_id = request_id
        started = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
        except Exception:
            ms = (time.perf_counter() - started) * 1000
            log.exception("request failed", extra={"fields": {"request_id": request_id, "method": request.method, "path": request.url.path, "duration_ms": round(ms, 2)}})
            raise
        ms = (time.perf_counter() - started) * 1000
        route = getattr(request.scope.get("route"), "path", None) or "unmatched"
        if request.method != "OPTIONS":
            api_metrics.add(f"{request.method} {route}", status, ms)
        response.headers[REQUEST_ID_HEADER] = request_id
        response.headers["Server-Timing"] = f"app;dur={ms:.1f}"
        log.info(
            "request",
            extra={
                "fields": {
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "route": route,
                    "status": status,
                    "duration_ms": round(ms, 2),
                }
            },
        )
        return response


def uptime_seconds() -> int:
    return int(time.time() - STARTED_AT)
