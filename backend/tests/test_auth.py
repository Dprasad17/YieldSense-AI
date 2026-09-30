import json
from datetime import timedelta

from backend.app.core.security import create_access_token, legacy_sha256_hash


def read_users(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_demo_users_sign_in(client):
    for username, password in (("admin", "admin123"), ("farmer", "farmer123"), ("agronomist", "agro123")):
        res = client.post("/api/auth/login", json={"username": username, "password": password})
        assert res.status_code == 200
        body = res.json()
        assert body["username"] == username and body["expires_in"] == 3600


def test_wrong_password_uses_error_envelope(client):
    res = client.post("/api/auth/login", json={"username": "admin", "password": "nope"})
    assert res.status_code == 401
    assert res.json() == {"error": {"code": "invalid_credentials", "message": "Incorrect username or password."}}


def test_login_rate_limited_after_five_failures(client):
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": "farmer", "password": "x"}).status_code == 401
    res = client.post("/api/auth/login", json={"username": "farmer", "password": "farmer123"})
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "rate_limited"
    assert int(res.headers["Retry-After"]) > 0


def test_legacy_sha256_hash_is_migrated_to_bcrypt(client, users_file):
    users = read_users(users_file)
    users["legacy"] = {
        "username": "legacy",
        "email": "legacy@example.com",
        "hashed_password": legacy_sha256_hash("oldpass1"),
        "role": "Farmer",
        "full_name": "Legacy User",
    }
    with open(users_file, "w", encoding="utf-8") as f:
        json.dump(users, f)

    assert client.post("/api/auth/login", json={"username": "legacy", "password": "wrong"}).status_code == 401
    assert read_users(users_file)["legacy"]["hash_scheme"] == "sha256"

    assert client.post("/api/auth/login", json={"username": "legacy", "password": "oldpass1"}).status_code == 200
    migrated = read_users(users_file)["legacy"]
    assert migrated["hash_scheme"] == "bcrypt" and migrated["hashed_password"].startswith("$2")
    assert client.post("/api/auth/login", json={"username": "legacy", "password": "oldpass1"}).status_code == 200


def test_expired_token_returns_token_expired(client):
    token = create_access_token({"sub": "farmer"}, expires_delta=timedelta(seconds=-5))
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401 and res.json()["error"]["code"] == "token_expired"


def test_me_requires_token(client, auth):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401
    me = client.get("/api/auth/me", headers=auth("farmer")).json()
    assert me["user"]["full_name"] == "Ramesh Kumar"


def test_register_cannot_self_assign_admin(client):
    body = {"username": "newadmin", "email": "a@example.com", "password": "secret12", "role": "Admin"}
    res = client.post("/api/auth/register", json=body)
    assert res.status_code == 422 and res.json()["error"]["code"] == "validation_error"
    body["role"] = "Agronomist"
    assert client.post("/api/auth/register", json=body).status_code == 200
    assert client.post("/api/auth/register", json=body).status_code == 409


def test_cors_uses_explicit_origins(client):
    res = client.options(
        "/api/public/stats",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-credentials" not in res.headers
    evil = client.options("/api/public/stats", headers={"Origin": "http://evil.test", "Access-Control-Request-Method": "GET"})
    assert evil.headers.get("access-control-allow-origin") is None
