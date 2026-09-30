from backend.app.core import agronomy_rules as ar
from backend.app.services import weather_service as ws

PREDICT_BODY = {
    "crop_type": "Rice", "region": "India", "irrigation_type": "Drip", "fertilizer_type": "Urea",
    "crop_disease_status": "None", "soil_pH": 6.2, "soil_moisture_%": 40, "temperature_C": 25,
    "rainfall_mm": 1100, "humidity_%": 60, "sunlight_hours": 7.4, "pesticide_usage_ml": 450,
    "total_days": 130, "year": 2013, "record_code": "FARM00001",
}


def test_records_pagination_envelope(client, auth):
    body = client.get("/api/data/records?page=2&page_size=15&crop=Potato", headers=auth("agronomist")).json()
    assert set(body) == {"items", "total", "page", "page_size"}
    assert body["total"] == 4276 and body["page"] == 2 and len(body["items"]) == 15
    assert all(r["crop_type"] == "Potato" for r in body["items"])
    assert "soil_moisture_%" in body["items"][0]


def test_summary_exposes_real_counts(client, auth):
    s = client.get("/api/data/summary", headers=auth("farmer")).json()
    assert s["total_farms"] == 28242 and len(s["crops_supported"]) == 10 and len(s["regions"]) == 101
    assert (s["year_min"], s["year_max"]) == (1990, 2013) and s["missing_years"] == [2003]


def test_region_ranking_sorted(client, auth):
    body = client.get("/api/analytics/regions?crop=Rice&limit=5", headers=auth("farmer")).json()
    means = [r["mean_yield_kg_ha"] for r in body["regions"]]
    assert means == sorted(means, reverse=True) and len(means) == 5


def test_seasonal_trends_yearly_with_band(client, auth):
    body = client.get("/api/analytics/seasonal-trends?region=India&crop=Rice", headers=auth("farmer")).json()
    assert body["granularity"] == "year" and body["series"][0]["year"] == 1990
    fc = body["forecast"]
    assert fc["year"] == 2014 and fc["p10_kg_ha"] <= fc["mean_kg_ha"] <= fc["p90_kg_ha"]
    assert client.get("/api/analytics/seasonal-trends?crop=Nope", headers=auth("farmer")).status_code == 404


def test_farm_comparison(client, auth):
    body = client.get("/api/analytics/farm-comparison?region=India&limit=3", headers=auth("farmer")).json()
    y = [f["yield_kg_ha"] for f in body["farms"]]
    assert len(y) == 3 and y == sorted(y, reverse=True)
    assert all(0 <= f["soil_health_index"] <= 1 and f["risk_rating"] in ("Low", "Medium", "High") for f in body["farms"])


def test_predict_saves_history_with_interval(client, auth):
    res = client.post("/api/predict", json=PREDICT_BODY, headers=auth("farmer"))
    assert res.status_code == 200
    p = res.json()
    assert p["low_kg_ha"] <= p["predicted_yield_kg_ha"] <= p["high_kg_ha"] and p["model_name"] == "XGBoost" and p["model_version"] == "2.0.0"

    mine = client.get("/api/predictions", headers=auth("farmer")).json()
    assert any(i["id"] == p["id"] for i in mine["items"])
    assert client.get(f"/api/predictions/{p['id']}", headers=auth("farmer")).status_code == 200
    # Another farmer-level user cannot see it; agronomists can.
    client.post("/api/auth/register", json={"username": "farmer2", "email": "f2@example.com", "password": "secret12"})
    t2 = client.post("/api/auth/login", json={"username": "farmer2", "password": "secret12"}).json()["access_token"]
    assert client.get(f"/api/predictions/{p['id']}", headers={"Authorization": f"Bearer {t2}"}).status_code == 404
    assert client.get(f"/api/predictions/{p['id']}", headers=auth("agronomist")).status_code == 200

    farm = client.get("/api/data/records/FARM00001", headers=auth("farmer")).json()
    assert any(x["id"] == p["id"] for x in farm["predictions"])


def test_predict_validation_error_envelope(client, auth):
    res = client.post("/api/predict", json={**PREDICT_BODY, "soil_pH": 42}, headers=auth("farmer"))
    assert res.status_code == 422 and res.json()["error"]["message"].startswith("soil_pH")


def test_recommendations_are_rule_based_and_actionable(client, auth):
    hub = client.get("/api/predict/recommendations-hub?region=India", headers=auth("farmer")).json()
    assert hub["record_count"] > 0 and hub["context"]["source"].startswith("YieldSense dataset")
    for rec in hub["recommendations"]:
        assert rec["severity"] in ("critical", "high", "medium", "info")
        assert rec["rationale"] and rec["rationale_source"] == "YieldSense rule engine (fallback)"
        assert "Sector" not in rec["title"] and "Iowa" not in rec["affected_area"]
    if hub["recommendations"]:
        rec_id = hub["recommendations"][0]["id"]
        res = client.post(f"/api/recommendations/{rec_id}/actions", json={"action": "create_task"}, headers=auth("farmer"))
        assert res.status_code == 200 and res.json()["task"]["status"] == "open"
        res = client.post(f"/api/recommendations/{rec_id}/actions", json={"action": "snooze", "snooze_days": 2}, headers=auth("farmer"))
        assert res.json()["task"]["status"] == "snoozed" and res.json()["task"]["snooze_until"]
        again = client.get("/api/predict/recommendations-hub?region=India", headers=auth("farmer")).json()
        assert next(r for r in again["recommendations"] if r["id"] == rec_id)["task"]["status"] == "snoozed"
    assert client.post("/api/recommendations/bogus/actions", json={"action": "done"}, headers=auth("farmer")).status_code == 404


def test_risk_matrix_and_anomalies(client, auth):
    body = client.get("/api/risk?region=India", headers=auth("farmer")).json()
    assert {r["type"] for r in body["risks"]} == {"drought", "flood", "heat", "pest_disease", "soil"}
    for r in body["risks"]:
        assert r["score"] == r["likelihood"] * r["impact"] and 1 <= r["likelihood"] <= 5
    assert all(abs(a["z_score"]) > 3 for a in body["anomalies"])


def test_notifications_dedup_and_read(client, auth):
    h = auth("agronomist")
    client.get("/api/notifications?region=India", headers=h)
    first = client.get("/api/notifications", headers=h).json()["total"]
    client.get("/api/notifications?region=India", headers=h)
    assert client.get("/api/notifications", headers=h).json()["total"] == first  # deduplicated
    if first:
        nid = client.get("/api/notifications", headers=h).json()["items"][0]["id"]
        assert client.patch(f"/api/notifications/{nid}", json={"read": True}, headers=h).json()["read"] is True
    client.patch("/api/notifications/read-all", headers=h)
    assert client.get("/api/notifications", headers=h).json()["unread_count"] == 0


def test_soil_uses_agronomy_rules(client, auth):
    body = client.get("/api/soil/assessment?crop=Rice&region=India", headers=auth("farmer")).json()
    rng = ar.rules_for("Rice").optimal["soil_pH"]
    assert body["soil_metrics"]["optimal_ph_low"] == rng.low and body["soil_metrics"]["optimal_ph_high"] == rng.high
    assert len(body["crop_suitability"]) == 10 and len(body["guidance"]) == 3


def test_export_csv_and_xlsx(client, auth):
    res = client.post("/api/reports/export", json={"format": "csv", "crop_type": "Rice", "region": "India"}, headers=auth("farmer"))
    assert res.status_code == 200 and "yieldsense_india_rice.csv" in res.headers["content-disposition"]
    lines = res.text.strip().splitlines()
    assert lines[0].startswith("farm_id") and len(lines) - 1 == int(res.headers["x-total-records"])
    x = client.post("/api/reports/export", json={"format": "xlsx", "crop_type": "Rice"}, headers=auth("farmer"))
    assert x.status_code == 200 and x.content[:2] == b"PK"


def test_live_weather_uses_sunshine_duration(client, auth, monkeypatch):
    def fake_get(url: str) -> dict:
        assert "sunshine_duration" in url
        return {
            "current": {"temperature_2m": 30.0, "relative_humidity_2m": 55.0, "precipitation": 0.0, "wind_speed_10m": 9.0},
            "daily": {
                "time": [f"2026-10-0{i}" for i in range(1, 8)],
                "temperature_2m_max": [33.0] * 7, "temperature_2m_min": [22.0] * 7,
                "precipitation_sum": [1.0] * 7, "sunshine_duration": [36000.0] * 7,
            },
        }

    monkeypatch.setattr(ws, "_http_get_json", fake_get)
    body = client.get("/api/weather/analysis?region=India&live=true", headers=auth("farmer")).json()
    assert body["mode"] == "live" and body["analytics"]["average_sunlight_hours"] == 10.0
    assert body["forecast"][0]["sunshine_hours"] == 10.0 and len(body["forecast"]) == 7

    def down(url: str) -> dict:
        raise OSError("offline")

    monkeypatch.setattr(ws, "_http_get_json", down)
    res = client.get("/api/weather/analysis?region=India&live=true", headers=auth("farmer"))
    assert res.status_code == 502 and res.json()["error"]["code"] == "live_weather_unavailable"


def test_admin_user_management_and_audit(client, auth):
    h = auth("admin")
    res = client.patch("/api/admin/users/admin", json={"role": "Farmer"}, headers=h)
    assert res.status_code == 409
    assert client.patch("/api/admin/users/admin", json={"active": False}, headers=h).status_code == 409

    client.post("/api/auth/register", json={"username": "promoteme", "email": "p@example.com", "password": "secret12"})
    assert client.patch("/api/admin/users/promoteme", json={"role": "Agronomist"}, headers=h).json()["role"] == "Agronomist"
    audit = client.get("/api/admin/audit", headers=h).json()["items"]
    assert audit[0]["action"] == "role_changed" and audit[0]["detail"] == {"from": "Farmer", "to": "Agronomist"}

    # Deactivation takes effect immediately, even for an existing token.
    tok = client.post("/api/auth/login", json={"username": "promoteme", "password": "secret12"}).json()["access_token"]
    client.patch("/api/admin/users/promoteme", json={"active": False}, headers=h)
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 403
    assert client.post("/api/auth/login", json={"username": "promoteme", "password": "secret12"}).status_code == 403


def test_predict_rejects_ndvi_and_field_conditions_are_optional(client, auth):
    res = client.post("/api/predict", json={**PREDICT_BODY, "NDVI_index": 0.6}, headers=auth("farmer"))
    assert res.status_code == 422
    minimal = {k: PREDICT_BODY[k] for k in ("crop_type", "region", "rainfall_mm", "temperature_C", "pesticide_usage_ml", "total_days")}
    p = client.post("/api/predict", json=minimal, headers=auth("farmer")).json()
    assert p["year"] == 2013 and p["low_kg_ha"] <= p["predicted_yield_kg_ha"] <= p["high_kg_ha"]


def test_prediction_matches_served_bundle(client, auth):
    import joblib
    import pandas as pd

    bundle = joblib.load("models/v2/model.pkl")
    body = {**PREDICT_BODY, "year": 2010}
    expected = float(bundle["pipeline"].predict(pd.DataFrame([{f: body[f] for f in bundle["features"]}]))[0])
    p = client.post("/api/predict", json=body, headers=auth("farmer")).json()
    assert abs(p["predicted_yield_kg_ha"] - round(max(expected, 0), 2)) < 0.01
    assert abs(p["high_kg_ha"] - p["predicted_yield_kg_ha"] - bundle["residual_q90"]) < 0.02


def test_model_card_and_provenance(client, auth):
    assert client.get("/api/predict/models", headers=auth("farmer")).status_code == 403
    card = client.get("/api/predict/models", headers=auth("agronomist")).json()
    assert card["selected"]["model"] == "XGBoost" and {r["split"] for r in card["results"]} == {"random", "temporal", "unseen_region"}
    assert "NDVI_index" not in card["features"]["numeric"]
    active = client.get("/api/predict/models/active", headers=auth("farmer")).json()
    assert active["name"] == "XGBoost" and active["split"] == "temporal" and active["r2"] == card["selected"]["metrics"]["r2"]
    reg = client.get("/api/data/provenance", headers=auth("farmer")).json()
    cols = {c["column"]: c for c in reg["columns"]}
    assert cols["NDVI_index"]["provenance"] == "derived" and not cols["NDVI_index"]["used_by_model"]
    assert cols["rainfall_mm"]["provenance"] == "real" and cols["rainfall_mm"]["used_by_model"]
    assert cols["soil_pH"]["provenance"] == "synthetic" and not cols["soil_pH"]["used_by_model"]
    assert cols["total_days"]["provenance"] == "synthetic" and cols["total_days"]["used_by_model"]


def test_recommendation_impact_only_for_model_features(client, auth):
    hub = client.get("/api/predict/recommendations-hub", headers=auth("farmer")).json()
    for r in hub["recommendations"]:
        modelled = r["rule"] in ("heat_stress", "rainfall_deficit")
        assert (r["impact_kg_ha"] is not None) == modelled, r["rule"]
        assert r["rule"] != "low_vigour"


def test_forecast_uses_year_feature(client, auth):
    t = client.get("/api/analytics/seasonal-trends?crop=Wheat", headers=auth("farmer")).json()
    f = t["forecast"]
    assert f["year"] == 2014 and f["p10_kg_ha"] <= f["mean_kg_ha"] <= f["p90_kg_ha"] and "XGBoost" in f["method"]
