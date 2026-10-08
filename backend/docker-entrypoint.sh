#!/bin/sh
# Container start-up: wait for the databases, apply migrations, seed once, then start the API.
set -e

echo "[entrypoint] waiting for PostgreSQL and MongoDB…"
python - <<'PY'
import sys, time
from sqlalchemy import create_engine, text
from pymongo import MongoClient
from backend.app.core.config import settings

deadline = time.time() + 90
while True:
    try:
        with create_engine(settings.DATABASE_URL).connect() as c:
            c.execute(text("SELECT 1"))
        MongoClient(settings.MONGO_URL, serverSelectionTimeoutMS=2000).admin.command("ping")
        print("[entrypoint] databases are reachable")
        break
    except Exception as e:  # noqa: BLE001
        if time.time() > deadline:
            print(f"[entrypoint] databases not reachable: {e}", file=sys.stderr)
            sys.exit(1)
        time.sleep(2)
PY

echo "[entrypoint] applying migrations"
alembic -c backend/alembic.ini upgrade head

# Seeding is idempotent: reference rows, demo users and demo farms are only inserted when missing.
if [ "${SEED_ON_START:-true}" = "true" ]; then
    echo "[entrypoint] seeding (SEED_ON_START=true)"
    python scripts/seed.py
fi

exec "$@"
