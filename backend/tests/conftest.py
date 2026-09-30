"""Tests run against a dedicated PostgreSQL database (TEST_DATABASE_URL) and Mongo database (yieldsense_test)."""
import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
os.chdir(ROOT)  # the API resolves datasets/ and models/ relative to the repo root

from backend.app.core.config import settings  # noqa: E402  (loads backend/.env)

TEST_DB = os.environ.get("TEST_DATABASE_URL")
if not TEST_DB:
    raise RuntimeError("Set TEST_DATABASE_URL (see backend/.env.example) to run the tests.")
os.environ["DATABASE_URL"] = TEST_DB
settings.DATABASE_URL = TEST_DB
settings.MONGO_DB = os.environ.get("TEST_MONGO_DB", "yieldsense_test")
os.environ["GROQ_API_KEY"] = ""

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402

from backend.app.db.session import engine  # noqa: E402


def _prepare_database() -> None:
    cfg = Config(os.path.join(ROOT, "backend", "alembic.ini"))
    command.upgrade(cfg, "head")
    with engine.begin() as c:
        c.execute(text("TRUNCATE users, farms, farm_records, predictions, recommendation_actions, notifications, risk_levels, audit_log RESTART IDENTITY CASCADE"))
        c.execute(text("DELETE FROM crop_records WHERE source <> 'reference'"))
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    import seed  # noqa: E402

    seed.seed_crop_records(reset=False)
    seed.seed_users()
    seed.seed_farms(reset=False)
    from backend.app.db import mongo

    mongo.client().drop_database(settings.MONGO_DB)
    mongo.ensure_indexes()


_prepare_database()

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.core.ratelimit import login_limiter  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.services.llm_service import llm_service  # noqa: E402

llm_service.groq_api_key = ""
llm_service.gemini_api_key = ""

PASSWORDS = {"admin": "admin123", "farmer": "farmer123", "agronomist": "agro123"}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_limiter():
    login_limiter.reset()
    yield
    login_limiter.reset()


def _token(client, username: str) -> str:
    res = client.post("/api/auth/login", json={"username": username, "password": PASSWORDS[username]})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


@pytest.fixture(scope="session")
def tokens(client):
    return {u: _token(client, u) for u in PASSWORDS}


@pytest.fixture
def auth(tokens):
    return lambda user: {"Authorization": f"Bearer {tokens[user]}"}
