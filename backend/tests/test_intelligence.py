"""Next-level features: explanations, assistant, satellite NDVI, market revenue, leaf check, Google sign-in,
digests, API rate limit, model monitoring."""
import io

import numpy as np
import pytest

from backend.app.core.config import settings

PREDICT = {"crop_type": "Wheat", "region": "India", "rainfall_mm": 1100, "temperature_C": 25, "pesticide_usage_ml": 450}


def test_prediction_explanation_and_history(client, auth):
    p = client.post("/api/predict/what-if", json=PREDICT, headers=auth("farmer")).json()
    ex = p["explanation"]
    feats = {c["feature"] for c in ex["contributions"]}
    assert {"yield_lag1", "yield_mean3", "rainfall_mm", "region"} <= feats
    assert ex["history"]["yield_lag1"] > 0
    # A farm's own history overrides the national lookup and moves the prediction.
    own = client.post("/api/predict/what-if", json={**PREDICT, "yield_lag1": 1000, "yield_mean3": 1000}, headers=auth("farmer")).json()
    assert own["explanation"]["history"] == {"yield_lag1": 1000.0, "yield_mean3": 1000.0}
    assert own["predicted_yield_kg_ha"] < p["predicted_yield_kg_ha"]


def test_assistant_uses_user_context(client, auth, monkeypatch):
    from backend.app.services import assistant
    from backend.app.services.llm_service import llm_service

    assert client.get("/api/assistant/status", headers=auth("farmer")).json()["available"] is False
    res = client.post("/api/assistant/ask", json={"message": "What should I do this week?"}, headers=auth("farmer"))
    assert res.status_code == 503 and res.json()["error"]["code"] == "assistant_unavailable"

    seen = {}

    def fake(messages):
        seen["messages"] = messages
        return "Irrigate Green Valley Farm this week."

    monkeypatch.setattr(llm_service, "groq_api_key", "test-key")
    monkeypatch.setattr(assistant, "_groq", fake)
    out = client.post("/api/assistant/ask", json={"message": "What should I do this week?", "page": "Dashboard"}, headers=auth("farmer")).json()
    assert out["answer"].startswith("Irrigate")
    system = seen["messages"][0]["content"]
    assert "Green Valley Farm" in system and "CONTEXT" in system and "Dashboard" in system
    hist = client.get("/api/assistant/history", headers=auth("farmer")).json()
    assert [m["role"] for m in hist[-2:]] == ["user", "assistant"]
    # History is per user.
    assert client.get("/api/assistant/history", headers=auth("agronomist")).json() == []
    assert client.delete("/api/assistant/history", headers=auth("farmer")).status_code == 204
    assert client.get("/api/assistant/history", headers=auth("farmer")).json() == []


def test_farm_ndvi_compares_with_last_year(client, auth, monkeypatch):
    from backend.app.services import satellite

    dates = [{"modis_date": f"A{2025 + (i // 23)}{(i % 23) * 16 + 1:03d}", "calendar_date": f"{2025 + (i // 23)}-{1 + (i % 23) // 2:02d}-{1 + (i % 2) * 14:02d}"} for i in range(46)]

    def fake_get(url):
        if "/dates" in url:
            return {"dates": dates}
        start = url.split("startDate=")[1].split("&")[0]
        end = url.split("endDate=")[1].split("&")[0]
        chosen = [d for d in dates if start <= d["modis_date"] <= end]
        this_year = start.startswith("A2026")
        return {"subset": [{"calendar_date": d["calendar_date"], "data": [5000 if this_year else 6000]} for d in chosen]}

    monkeypatch.setattr(satellite, "_get", fake_get)
    monkeypatch.setattr(satellite, "_cached", lambda key, ttl, fetch: fetch())
    farms = client.get("/api/farms", headers=auth("farmer")).json()["items"]
    farm = next(f for f in farms if f["latitude"] is not None)
    body = client.get(f"/api/farms/{farm['id']}/ndvi", headers=auth("farmer")).json()
    assert len(body["points"]) == 23 and body["points"][-1]["ndvi"] == 0.5
    assert body["change_vs_last_year_pct"] == pytest.approx(-16.7, abs=0.1) and body["status"] == "alert"
    assert client.get(f"/api/farms/{farm['id']}/ndvi", headers=auth("admin")).status_code == 200

    def down(url):
        raise OSError("timeout")

    monkeypatch.setattr(satellite, "_get", down)
    res = client.get(f"/api/farms/{farm['id']}/ndvi", headers=auth("farmer"))
    assert res.status_code == 502 and res.json()["error"]["code"] == "satellite_unavailable"


def test_market_revenue_ranks_crops(client, auth):
    body = client.get("/api/market/crop-economics?region=Kenya", headers=auth("farmer")).json()
    assert body["season"] == 2024 and len(body["items"]) >= 3
    revenues = [i["revenue_usd_per_ha"] for i in body["items"] if i["revenue_usd_per_ha"] is not None]
    assert revenues == sorted(revenues, reverse=True)
    item = body["items"][0]
    assert item["revenue_usd_per_ha"] == pytest.approx(item["predicted_yield_kg_ha"] / 1000 * item["price_usd_per_tonne"], rel=0.01)
    assert "profit" in body["note"]
    farms = client.get("/api/farms", headers=auth("farmer")).json()["items"]
    f = client.get(f"/api/market/crop-economics?farm_id={farms[0]['id']}", headers=auth("farmer")).json()
    assert f["area_ha"] == farms[0]["area_ha"] and {i["crop"] for i in f["items"]} <= set(farms[0]["crops"])
    assert all(i["revenue_usd_farm"] is None or i["revenue_usd_farm"] > 0 for i in f["items"])
    assert client.get("/api/market/crop-economics?region=Atlantis", headers=auth("farmer")).status_code == 422


def test_leaf_check_classifies_an_image(client, auth):
    from PIL import Image

    buf = io.BytesIO()
    Image.fromarray((np.random.default_rng(0).random((300, 400, 3)) * 255).astype("uint8")).save(buf, format="PNG")
    res = client.post("/api/disease/classify", files={"file": ("leaf.png", buf.getvalue(), "image/png")}, headers=auth("farmer"))
    assert res.status_code == 200
    body = res.json()
    assert len(body["top"]) == 3 and abs(sum(t["probability"] for t in body["top"])) <= 1.0001
    assert body["top"][0]["probability"] >= body["top"][1]["probability"]
    assert "not a diagnosis" in body["note"]
    bad = client.post("/api/disease/classify", files={"file": ("x.png", b"not an image", "image/png")}, headers=auth("farmer"))
    assert bad.status_code == 400
    assert client.post("/api/disease/classify", files={"file": ("x.txt", b"hello", "text/plain")}, headers=auth("farmer")).status_code == 415
    assert len(client.get("/api/disease/classes", headers=auth("farmer")).json()) == 38


def test_google_sign_in(client, monkeypatch):
    from backend.app.api import auth as auth_api

    assert client.get("/api/auth/providers").json() == {"google_client_id": None}
    assert client.post("/api/auth/google", json={"credential": "x" * 40}).status_code == 404

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "client-123.apps.googleusercontent.com")
    monkeypatch.setattr(auth_api, "verify_google_token", lambda c: {"email": "Asha.Patil@example.com", "name": "Asha Patil", "email_verified": "true"})
    first = client.post("/api/auth/google", json={"credential": "x" * 40}).json()
    assert first["role"] == "Farmer" and first["email"] == "asha.patil@example.com" and first["username"].startswith("asha.patil")
    again = client.post("/api/auth/google", json={"credential": "x" * 40}).json()
    assert again["username"] == first["username"]  # same account on the next sign-in
    # An existing account with that email is reused (role kept).
    monkeypatch.setattr(auth_api, "verify_google_token", lambda c: {"email": "agronomist@yieldsense.ai", "name": "A", "email_verified": "true"})
    assert client.post("/api/auth/google", json={"credential": "x" * 40}).json()["username"] == "agronomist"


def test_digest_preferences_and_sending(client, auth, monkeypatch):
    from backend.app.services import messaging

    assert client.get("/api/notifications/digest/channels", headers=auth("farmer")).json() == {"email": False, "sms": False}
    bad = client.patch("/api/auth/me", json={"notification_prefs": {"sms_digest": True, "phone": "98765"}}, headers=auth("farmer"))
    assert bad.status_code == 422
    ok = client.patch("/api/auth/me", json={"notification_prefs": {"email_digest": True, "sms_digest": True, "phone": "+919876543210"}}, headers=auth("farmer"))
    assert ok.status_code == 200 and ok.json()["user"]["notification_prefs"]["phone"] == "+919876543210"

    sent = []
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_FROM", "noreply@test")
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC1")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "t")
    monkeypatch.setenv("TWILIO_FROM", "+15550000000")
    monkeypatch.setattr(messaging, "send_email", lambda to, subject, text: sent.append(("email", to, text)))
    monkeypatch.setattr(messaging, "send_sms", lambda to, text: sent.append(("sms", to, text)))
    r = client.post("/api/notifications/digest/send-me", headers=auth("farmer")).json()
    assert r["email"] == 1 and r["sms"] == 1
    assert sent[0][1] == "farmer@yieldsense.ai" and "weekly summary" in sent[0][2] and sent[1][2].startswith("YieldSense AI:")

    assert client.post("/api/admin/digests/send", headers=auth("farmer")).status_code == 403
    monkeypatch.setattr(settings, "CRON_TOKEN", "cron-secret")
    assert client.post("/api/admin/digests/send", headers={"X-Cron-Token": "wrong"}).status_code == 401
    assert client.post("/api/admin/digests/send", headers={"X-Cron-Token": "cron-secret"}).status_code == 200
    client.patch("/api/auth/me", json={"notification_prefs": {"email_digest": False, "sms_digest": False, "phone": None}}, headers=auth("farmer"))


def test_api_rate_limit(client, auth, monkeypatch):
    from backend.app.core.ratelimit import api_limiter

    h = auth("farmer")
    monkeypatch.setattr(settings, "RATE_LIMIT_PER_MINUTE", 3)
    api_limiter.reset()
    codes = [client.get("/api/data/summary", headers=h).status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3] == 429
    res = client.get("/api/data/summary", headers=h)
    assert res.json()["error"]["code"] == "rate_limited" and int(res.headers["Retry-After"]) >= 1
    assert client.get("/api/health").status_code == 200  # exempt
    monkeypatch.setattr(settings, "RATE_LIMIT_PER_MINUTE", 0)
    api_limiter.reset()


def test_model_monitoring(client, auth):
    assert client.get("/api/admin/model-monitoring", headers=auth("farmer")).status_code == 403
    body = client.get("/api/admin/model-monitoring", headers=auth("agronomist")).json()
    versions = {v["version"]: v for v in body["registry"]}
    assert versions["3.0.0"]["served"] and not versions["2.1.0"]["served"]
    assert versions["3.0.0"]["data_last_year"] == 2023
    assert body["drift"]["status"] in ("not_enough_data", "stable", "watch", "drifted")


def test_psi():
    from backend.app.services.monitoring import psi

    rng = np.random.default_rng(1)
    base = rng.normal(0, 1, 5000)
    assert psi(base, rng.normal(0, 1, 2000)) < 0.05
    assert psi(base, rng.normal(1.5, 1, 2000)) > 0.25
