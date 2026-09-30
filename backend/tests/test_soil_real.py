"""Real soil (SoilGrids, mocked) and Soil Health Card nutrient ratings."""
import json
import os

import pytest

from backend.app.services import soil_real

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "soilgrids_india.json")


@pytest.fixture
def soilgrids_ok(monkeypatch):
    raw = json.load(open(FIXTURE, encoding="utf-8"))
    calls = []

    def fake(url):
        calls.append(url)
        return raw

    monkeypatch.setattr(soil_real, "_http_json", fake)
    return calls


def test_parse_weighted_0_30cm(soilgrids_ok):
    data = soil_real.fetch_soilgrids(20.59, 78.96)
    p = data["properties"]
    # pH*10 72,72,73 weighted 5/10/15 cm -> 7.25
    assert p["ph"]["value_0_30cm"] == 7.25
    # soc dg/kg 121,78,51 -> (605+780+765)/30 = 71.67 dg/kg = 0.72 %
    assert p["organic_carbon_percent"]["value_0_30cm"] == 0.72
    assert p["cec_cmol_kg"]["value_0_30cm"] == 42.92 and p["clay_percent"]["value_0_30cm"] == 42.7
    assert data["cached"] is False
    again = soil_real.fetch_soilgrids(20.59, 78.96)
    assert again["cached"] is True and len(soilgrids_ok) == 1


def test_nutrient_ratings_use_shc_limits():
    r = {x["nutrient"]: x for x in soil_real.nutrient_ratings({"nitrogen_kg_ha": 250, "phosphorus_kg_ha": 18, "potassium_kg_ha": 300, "organic_matter_percent": 1.0})}
    assert r["nitrogen_kg_ha"]["rating"] == "Low" and r["phosphorus_kg_ha"]["rating"] == "Medium" and r["potassium_kg_ha"]["rating"] == "High"
    assert r["organic_carbon_percent"]["value"] == 0.58 and r["organic_carbon_percent"]["rating"] == "Medium"
    assert r["phosphorus_kg_ha"]["oxide_equivalent"] == "41.2 kg P2O5/ha"
    assert soil_real.rate(280, 280, 560) == "Medium" and soil_real.rate(560.1, 280, 560) == "High"


def test_farm_soil_endpoint_real_values(client, auth, soilgrids_ok):
    farm = next(f for f in client.get("/api/farms", headers=auth("farmer")).json()["items"] if f["name"] == "Green Valley Farm")
    client.post("/api/soil-tests", json={"farm_id": farm["id"], "sampled_on": "2026-06-01", "ph": 6.4, "nitrogen_kg_ha": 300, "phosphorus_kg_ha": 8, "potassium_kg_ha": 150, "organic_carbon_percent": 0.45}, headers=auth("farmer"))
    s = client.get(f"/api/farms/{farm['id']}/soil", headers=auth("farmer")).json()
    assert s["source"] == "real (SoilGrids)" and s["properties"]["ph"]["value_0_30cm"] == 7.25
    a = s["assessment"]
    assert a["ph"] == {"value": 6.4, "source": "soil test", "rating": "Moderately acidic"}
    assert a["organic_carbon"]["rating"] == "Low" and a["cec"]["rating"] == "High"
    ratings = {x["nutrient"]: x["rating"] for x in s["soil_tests"][0]["ratings"]}
    assert ratings == {"nitrogen_kg_ha": "Medium", "phosphorus_kg_ha": "Low", "potassium_kg_ha": "Medium", "organic_carbon_percent": "Low"}


def test_farm_soil_outage_is_an_error_not_synthetic(client, auth, monkeypatch):
    def down(url):
        raise TimeoutError("timed out")

    monkeypatch.setattr(soil_real, "_http_json", down)
    farm = client.get("/api/farms", headers=auth("farmer")).json()["items"][1]
    res = client.get(f"/api/farms/{farm['id']}/soil", headers=auth("farmer"))
    assert res.status_code == 502 and res.json()["error"]["code"] == "soilgrids_unavailable"
