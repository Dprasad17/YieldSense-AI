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
    assert body["total"] == 3163 and body["page"] == 2 and len(body["items"]) == 15
    assert all(r["crop_type"] == "Potato" for r in body["items"])
    assert "soil_moisture_%" in body["items"][0]


def test_summary_exposes_real_counts(client, auth):
    s = client.get("/api/data/summary", headers=auth("farmer")).json()
    assert s["total_farms"] == 19834 and len(s["crops_supported"]) == 10 and len(s["regions"]) == 101
    assert (s["year_min"], s["year_max"]) == (1990, 2023) and s["missing_years"] == []


def test_region_ranking_sorted(client, auth):
    body = client.get("/api/analytics/regions?crop=Rice&limit=5", headers=auth("farmer")).json()
    means = [r["mean_yield_kg_ha"] for r in body["regions"]]
    assert means == sorted(means, reverse=True) and len(means) == 5


def test_seasonal_trends_yearly_with_band(client, auth):
    body = client.get("/api/analytics/seasonal-trends?region=India&crop=Rice", headers=auth("farmer")).json()
    assert body["granularity"] == "year" and body["series"][0]["year"] == 1990
    fc = body["forecast"]
    assert fc["year"] == 2024 and fc["p10_kg_ha"] <= fc["mean_kg_ha"] <= fc["p90_kg_ha"]
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
    assert p["low_kg_ha"] <= p["predicted_yield_kg_ha"] <= p["high_kg_ha"] and p["model_name"] == "XGBoost" and p["model_version"] == "3.0.0"

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
    monkeypatch.setattr(ws, "_met_norway_forecast", lambda lat, lon: down(""))
    res = client.get("/api/weather/analysis?region=India&live=true", headers=auth("farmer"))
    assert res.status_code == 502 and res.json()["error"]["code"] == "live_weather_unavailable"


def test_live_weather_falls_back_to_met_norway(client, auth, monkeypatch):
    """Open-Meteo answers 429 from shared cloud IPs; the forecast then comes from MET Norway."""
    series = []
    for h in range(0, 9 * 24, 6):  # 9 days of 6-hourly entries from 00:00 UTC
        t = f"2026-10-{1 + h // 24:02d}T{h % 24:02d}:00:00Z"
        series.append({
            "time": t,
            "data": {
                "instant": {"details": {"air_temperature": 20.0 + (h % 24) / 2, "relative_humidity": 60.0, "wind_speed": 5.0, "cloud_area_fraction": 50.0}},
                "next_6_hours": {"details": {"precipitation_amount": 1.5}},
            },
        })
    payload = {"properties": {"timeseries": series}}
    monkeypatch.setattr(ws, "_fetch_json", lambda url, ua="": payload)

    def limited(url: str) -> dict:
        raise OSError("HTTP Error 429: Too Many Requests")

    monkeypatch.setattr(ws, "_http_get_json", limited)
    monkeypatch.setattr(ws, "mongo_cached", lambda url, fetch: fetch())
    body = client.get("/api/weather/analysis?region=Germany&live=true", headers=auth("farmer")).json()
    assert body["data_source"] == "MET Norway" and len(body["forecast"]) == 7
    day = body["forecast"][0]
    assert day["temp_max_C"] == 29.0 and day["temp_min_C"] == 20.0 and day["precipitation_mm"] == 6.0
    assert 0 < day["sunshine_hours"] < 12
    assert body["current"]["wind_speed_kmh"] == 18.0


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
    minimal = {k: PREDICT_BODY[k] for k in ("crop_type", "region", "rainfall_mm", "temperature_C", "pesticide_usage_ml")}
    p = client.post("/api/predict", json=minimal, headers=auth("farmer")).json()
    # The season defaults to the one after the last dataset year; yield history comes from the crop records.
    assert p["year"] == 2024 and p["low_kg_ha"] <= p["predicted_yield_kg_ha"] <= p["high_kg_ha"]
    hist = p["explanation"]["history"]
    assert hist["yield_lag1"] and hist["yield_mean3"]


def test_prediction_matches_served_bundle(client, auth):
    import joblib
    import pandas as pd

    import numpy as np

    bundle = joblib.load("models/v2/model.pkl")
    # Explicit yield history, so the expected value doesn't depend on the lookup.
    body = {**PREDICT_BODY, "year": 2010, "yield_lag1": 3500.0, "yield_mean3": 3400.0}
    raw = float(bundle["pipeline"].predict(pd.DataFrame([{f: body[f] for f in bundle["features"]}]))[0])
    expected = float(np.expm1(raw)) if bundle["target"] == "log1p" else raw
    p = client.post("/api/predict", json=body, headers=auth("farmer")).json()
    assert abs(p["predicted_yield_kg_ha"] - round(max(expected, 0), 2)) < 0.01
    high = float(np.expm1(raw + bundle["residual_q90"])) if bundle["target"] == "log1p" else expected + bundle["residual_q90"]
    assert abs(p["high_kg_ha"] - round(high, 2)) < 0.02
    # The explanation adds up: base and contributions reproduce the model output.
    ex = p["explanation"]
    assert {c["feature"] for c in ex["contributions"]} == set(bundle["features"])
    if ex["unit"] == "percent":
        total = np.log1p(ex["base_kg_ha"]) + sum(np.log1p(c["contribution_pct"] / 100) for c in ex["contributions"])
        assert abs(np.expm1(total) - expected) / expected < 0.01


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
    assert cols["total_days"]["provenance"] == "synthetic" and not cols["total_days"]["used_by_model"]


def test_recommendation_impact_only_for_model_features(client, auth):
    hub = client.get("/api/predict/recommendations-hub", headers=auth("farmer")).json()
    for r in hub["recommendations"]:
        modelled = r["rule"] in ("heat_stress", "rainfall_deficit")  # rules on model inputs (rainfall varies by year since v3)
        assert (r["impact_kg_ha"] is not None) == modelled, r["rule"]
        assert r["rule"] != "low_vigour"


def test_forecast_uses_year_feature(client, auth):
    t = client.get("/api/analytics/seasonal-trends?crop=Wheat", headers=auth("farmer")).json()
    f = t["forecast"]
    assert f["year"] == 2024 and f["p10_kg_ha"] <= f["mean_kg_ha"] <= f["p90_kg_ha"] and "XGBoost" in f["method"]


def test_climate_trend_and_soil_bands(client, auth, monkeypatch):
    from backend.app.services import weather_service as wsm

    daily = {"time": [f"2001-{m:02d}-{d:02d}" for m in range(1, 13) for d in range(1, 31)] + [f"2001-12-31"] * 5,
             "temperature_2m_mean": [20.0] * 365, "precipitation_sum": [2.0] * 365}
    monkeypatch.setattr(wsm, "_archive_json", lambda url: {"daily": daily})
    t = client.get("/api/weather/climate-trend?region=india", headers=auth("farmer")).json()
    assert t["region"] == "India" and t["archive"] == [{"year": 2001, "temperature_C": 20.0, "precipitation_mm": 730.0}]
    assert t["dataset"][0]["year"] == 1990 and t["error"] is None

    soil = client.get("/api/soil/assessment?crop_type=Wheat", headers=auth("farmer")).json()
    features = {b["feature"]: b for b in soil["optimal_bands"]}
    assert {"soil_pH", "soil_moisture_%", "rainfall_mm", "temperature_C", "humidity_%", "sunlight_hours", "NDVI_index"} <= set(features)
    assert features["soil_pH"]["provenance"] == "synthetic" and features["rainfall_mm"]["provenance"] == "real"


def test_my_farms_comparison_and_prediction_delete(client, auth):
    mine = client.get("/api/analytics/my-farms", headers=auth("farmer")).json()["farms"]
    assert {f["name"] for f in mine} >= {"Green Valley Farm", "Riverbend Fields", "Hillside Potatoes"}
    gv = next(f for f in mine if f["name"] == "Green Valley Farm")
    assert gv["seasons"] >= 1 and gv["reference_kg_ha"] and gv["delta_pct"] is not None

    p = client.post("/api/predict", json=PREDICT_BODY, headers=auth("farmer")).json()
    assert client.delete(f"/api/predictions/{p['id']}", headers=auth("agronomist")).status_code == 404
    assert client.delete(f"/api/predictions/{p['id']}", headers=auth("farmer")).status_code == 204
    assert client.get(f"/api/predictions/{p['id']}", headers=auth("farmer")).status_code == 404


def test_incomplete_llm_insight_falls_back(client, auth, monkeypatch):
    from backend.app.services.llm_service import llm_service

    monkeypatch.setattr(llm_service, "groq_api_key", "test-key")
    monkeypatch.setattr(llm_service, "gemini_api_key", "")
    monkeypatch.setattr(llm_service, "_call_groq_api", lambda payload, result: {"ai_insights": "text", "risk_alerts": [], "llm_provider": "Groq · test"})
    res = client.post("/api/predict/insights", json=PREDICT_BODY, headers=auth("farmer"))
    assert res.status_code == 200 and res.json()["llm_provider"] == "YieldSense rule engine (fallback)"
    monkeypatch.setattr(llm_service, "_call_groq_api", lambda payload, result: {"ai_insights": "ok", "risk_alerts": [], "recommendations": ["a"], "llm_provider": "Groq · test"})
    assert client.post("/api/predict/insights", json=PREDICT_BODY, headers=auth("farmer")).json()["llm_provider"] == "Groq · test"


def test_eda_charts_single_country_has_yearly_rainfall_fit(client, auth):
    """Since dataset v3 rainfall varies by year (CRU TS), so one country has a real rainfall–yield fit."""
    one = client.get("/api/analytics/eda-charts?region=India&crop=Rice", headers=auth("agronomist"))
    assert one.status_code == 200
    body = one.json()
    assert body["rainfall_distinct_values"] == 34
    assert -1 <= body["rainfall_regression"]["r"] <= 1
    many = client.get("/api/analytics/eda-charts?crop=Rice", headers=auth("agronomist")).json()
    assert many["rainfall_distinct_values"] > 1 and -1 <= many["rainfall_regression"]["r"] <= 1
    assert many["rainfall_regression"]["r2"] == round(many["rainfall_regression"]["r"] ** 2, 4)


def test_eda_charts_empty_context_is_an_empty_result(client, auth):
    res = client.get("/api/analytics/eda-charts?region=Albania&crop=Cassava", headers=auth("agronomist"))
    assert res.status_code == 200
    body = res.json()
    assert body["record_count"] == 0 and body["yield_histogram"] == [] and body["rainfall_regression"]["r"] is None
