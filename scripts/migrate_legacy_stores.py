"""
One-time migration of the pre-database stores into PostgreSQL:

- backend/app/api/users_db.json  -> users (hashes and hash_scheme kept as-is)
- backend/data/app.db (SQLite)   -> predictions, recommendation_actions, notifications, risk_levels, audit_log

Idempotent: existing users/ids are skipped. Run from the repo root after `alembic upgrade head`:
  python scripts/migrate_legacy_stores.py
"""
import json
import os
import sqlite3
import sys
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import func, select  # noqa: E402

from backend.app.core.config import settings  # noqa: E402
from backend.app.db.models import AuditLog, Notification, Prediction, RecommendationAction, RiskLevel, User  # noqa: E402
from backend.app.db.session import session_scope  # noqa: E402
from backend.app.services.users import DEFAULT_NOTIFICATION_PREFS  # noqa: E402


def ts(v):
    return datetime.fromisoformat(v) if v else None


def migrate_users() -> dict[str, int]:
    ids: dict[str, int] = {}
    path = settings.LEGACY_USERS_FILE
    legacy = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    with session_scope() as s:
        for key, u in legacy.items():
            existing = s.scalar(select(User).where(func.lower(User.username) == key.lower()))
            if existing:
                ids[key.lower()] = existing.id
                continue
            scheme = u.get("hash_scheme") or ("bcrypt" if str(u["hashed_password"]).startswith("$2") else "sha256")
            row = User(username=u["username"], email=u["email"], full_name=u.get("full_name") or u["username"], role=u.get("role", "Farmer"),
                       hashed_password=u["hashed_password"], hash_scheme=scheme, active=u.get("active", True), notification_prefs=dict(DEFAULT_NOTIFICATION_PREFS))
            s.add(row)
            s.flush()
            ids[key.lower()] = row.id
            print(f"users: migrated {u['username']} ({scheme})")
        for u in s.scalars(select(User)):
            ids.setdefault(u.username.lower(), u.id)
    return ids


def migrate_sqlite(ids: dict[str, int]) -> None:
    path = settings.LEGACY_SQLITE_PATH
    if not os.path.exists(path):
        print("sqlite: no legacy database found")
        return
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    with session_scope() as s:
        def uid(name):
            return ids.get((name or "").lower())

        if "predictions" in tables:
            for r in con.execute("SELECT * FROM predictions"):
                if s.get(Prediction, r["id"]) or not uid(r["username"]):
                    continue
                s.add(Prediction(id=r["id"], user_id=uid(r["username"]), record_code=r["farm_id"], crop_type=r["crop_type"], region=r["region"],
                                 inputs=json.loads(r["inputs_json"]), predicted_yield_kg_ha=r["predicted_yield_kg_ha"], low_kg_ha=r["low_kg_ha"],
                                 high_kg_ha=r["high_kg_ha"], productivity_rating=r["productivity_rating"], risk_rating=r["risk_rating"],
                                 model_name=r["model_name"], model_version="1", model_r2=r["model_r2"], created_at=ts(r["created_at"])))
        if "tasks" in tables:
            for r in con.execute("SELECT * FROM tasks"):
                if s.get(RecommendationAction, r["id"]) or not uid(r["username"]):
                    continue
                s.add(RecommendationAction(id=r["id"], user_id=uid(r["username"]), recommendation_id=r["recommendation_id"], title=r["title"], region=r["region"],
                                           crop_type=r["crop_type"], status=r["status"], note=r["note"], snooze_until=ts(r["snooze_until"]),
                                           created_at=ts(r["created_at"]), updated_at=ts(r["updated_at"])))
        if "notifications" in tables:
            for r in con.execute("SELECT * FROM notifications"):
                if s.get(Notification, r["id"]) or not uid(r["username"]):
                    continue
                s.add(Notification(id=r["id"], user_id=uid(r["username"]), category=r["category"], severity=r["severity"], title=r["title"], body=r["body"],
                                   link=r["link"], dedupe_key=r["dedupe_key"], created_at=ts(r["created_at"]), read_at=ts(r["read_at"])))
        if "risk_levels" in tables:
            for r in con.execute("SELECT * FROM risk_levels"):
                if uid(r["username"]) and not s.get(RiskLevel, (uid(r["username"]), r["context_key"], r["risk_type"])):
                    s.add(RiskLevel(user_id=uid(r["username"]), context_key=r["context_key"], risk_type=r["risk_type"], level=r["level"]))
        if "audit_log" in tables:
            for r in con.execute("SELECT * FROM audit_log"):
                if s.get(AuditLog, r["id"]):
                    continue
                s.add(AuditLog(id=r["id"], actor_id=uid(r["actor"]), actor=r["actor"], action=r["action"], target=r["target"],
                               detail=json.loads(r["detail_json"]), created_at=ts(r["created_at"])))
    con.close()
    print("sqlite: migrated predictions, tasks, notifications, risk levels and audit log")


if __name__ == "__main__":
    migrate_sqlite(migrate_users())
