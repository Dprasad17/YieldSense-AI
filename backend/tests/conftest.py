import os
import sys
import tempfile

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
os.chdir(ROOT)  # the API resolves datasets/ and models/ relative to the repo root

_tmp = tempfile.mkdtemp(prefix="yieldsense-tests-")
os.environ["YIELDSENSE_DB_PATH"] = os.path.join(_tmp, "app.db")
os.environ["YIELDSENSE_USERS_FILE"] = os.path.join(_tmp, "users_db.json")
os.environ["GROQ_API_KEY"] = ""
os.environ["GEMINI_API_KEY"] = ""

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


@pytest.fixture
def users_file(tokens):
    from backend.app.core.config import settings

    return settings.USERS_FILE
