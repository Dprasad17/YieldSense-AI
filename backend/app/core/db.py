"""SQLite store for app-generated data: predictions, field tasks, notifications, audit log."""
import json
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from backend.app.core.config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL,
    farm_id TEXT,
    crop_type TEXT NOT NULL,
    region TEXT NOT NULL,
    inputs_json TEXT NOT NULL,
    predicted_yield_kg_ha REAL NOT NULL,
    low_kg_ha REAL NOT NULL,
    high_kg_ha REAL NOT NULL,
    productivity_rating TEXT NOT NULL,
    risk_rating TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_r2 REAL
);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(username, created_at);
CREATE INDEX IF NOT EXISTS idx_predictions_farm ON predictions(farm_id);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    recommendation_id TEXT NOT NULL,
    title TEXT NOT NULL,
    region TEXT,
    crop_type TEXT,
    status TEXT NOT NULL,
    note TEXT,
    snooze_until TEXT,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(recommendation_id, username)
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    dedupe_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT,
    UNIQUE(username, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(username, created_at);

CREATE TABLE IF NOT EXISTS risk_levels (
    username TEXT NOT NULL,
    context_key TEXT NOT NULL,
    risk_type TEXT NOT NULL,
    level TEXT NOT NULL,
    PRIMARY KEY (username, context_key, risk_type)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    detail_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

_lock = threading.Lock()
_initialized_for: str | None = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex


def _connect() -> sqlite3.Connection:
    global _initialized_for
    path = settings.DB_PATH
    if path != ":memory:":
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    if _initialized_for != path:
        with _lock:
            conn.executescript(SCHEMA)
            _initialized_for = path
    return conn


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        with _lock:
            yield conn
            conn.commit()
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), default=str)
