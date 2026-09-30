"""MongoDB: raw uploads + validation reports, soil test reports, Open-Meteo cache, LLM rationale cache."""
from functools import lru_cache
from typing import Any, Optional

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database

from backend.app.core.config import settings
from backend.app.core.observability import log


@lru_cache(maxsize=1)
def client() -> MongoClient:
    return MongoClient(settings.MONGO_URL, serverSelectionTimeoutMS=3000, tz_aware=True)


def db() -> Database:
    return client()[settings.MONGO_DB]


def ensure_indexes() -> None:
    d = db()
    d.uploads.create_index([("created_at", DESCENDING)])
    d.uploads.create_index([("user", ASCENDING), ("created_at", DESCENDING)])
    d.soil_tests.create_index([("farm_id", ASCENDING), ("sampled_on", DESCENDING)])
    d.soil_tests.create_index([("user", ASCENDING)])
    # TTL: Mongo removes cached documents once `expires_at` passes.
    d.weather_cache.create_index("expires_at", expireAfterSeconds=0)
    d.weather_cache.create_index("key", unique=True)
    d.llm_cache.create_index("key", unique=True)
    d.llm_cache.create_index("created_at", expireAfterSeconds=30 * 24 * 3600)


def ping() -> bool:
    try:
        client().admin.command("ping")
        return True
    except Exception:
        return False


def cache_get(collection: str, key: str) -> Optional[Any]:
    try:
        doc = db()[collection].find_one({"key": key})
    except Exception:
        return None
    return doc.get("value") if doc else None


def cache_set(collection: str, key: str, value: Any, expires_at=None) -> None:
    from datetime import datetime, timezone

    doc = {"key": key, "value": value, "created_at": datetime.now(timezone.utc)}
    if expires_at is not None:
        doc["expires_at"] = expires_at
    try:
        db()[collection].update_one({"key": key}, {"$set": doc}, upsert=True)
    except Exception as e:  # the cache is best-effort
        log.warning(f"[mongo] cache write failed: {e}")
