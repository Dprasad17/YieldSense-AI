"""Farms, farm records, soil tests, uploads (data collection), profile and farm scoping."""
import io

import pytest


@pytest.fixture
def farm(client, auth):
    body = {"name": "Test Farm", "region": "india", "area_ha": 4.5, "crops": ["rice", "Wheat"], "irrigation_type": "Drip", "soil_ph": 6.2}
    res = client.post("/api/farms", json=body, headers=auth("farmer"))
    assert res.status_code == 201, res.text
    f = res.json()
    yield f
    client.delete(f"/api/farms/{f['id']}", headers=auth("farmer"))


def test_farm_crud_and_ownership(client, auth, farm):
    assert farm["region"] == "India" and farm["crops"] == ["Rice", "Wheat"]
    mine = client.get("/api/farms", headers=auth("farmer")).json()
    assert any(f["id"] == farm["id"] for f in mine["items"])
    assert mine["total"] >= 4  # plus the three seeded demo farms
    assert client.get(f"/api/farms/{farm['id']}", headers=auth("agronomist")).status_code == 200
    assert client.patch(f"/api/farms/{farm['id']}", json={"area_ha": 5}, headers=auth("agronomist")).status_code == 403
    assert client.patch(f"/api/farms/{farm['id']}", json={"area_ha": 6}, headers=auth("farmer")).json()["area_ha"] == 6
    bad = client.post("/api/farms", json={"name": "XX", "region": "Atlantis", "area_ha": 1, "crops": ["Rice"]}, headers=auth("farmer"))
    assert bad.status_code == 422


def test_other_farmer_cannot_see_farm(client, auth, farm):
    client.post("/api/auth/register", json={"username": "farmer3", "email": "f3@example.com", "password": "secret123"})
    tok = client.post("/api/auth/login", json={"username": "farmer3", "password": "secret123"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    assert client.get(f"/api/farms/{farm['id']}", headers=h).status_code == 404
    assert client.get("/api/farms", headers=h).json()["total"] == 0


def test_farm_records_and_detail(client, auth, farm):
    rec = {"year": 2012, "crop_type": "Rice", "area_ha": 3, "yield_kg_ha": 3900, "rainfall_mm": 1000, "temperature_c": 26}
    r = client.post(f"/api/farms/{farm['id']}/records", json=rec, headers=auth("farmer"))
    assert r.status_code == 201
    rid = r.json()["id"]
    assert client.patch(f"/api/farms/{farm['id']}/records/{rid}", json={**rec, "yield_kg_ha": 4100}, headers=auth("farmer")).json()["yield_kg_ha"] == 4100
    detail = client.get(f"/api/farms/{farm['id']}", headers=auth("farmer")).json()
    assert detail["records"][0]["yield_kg_ha"] == 4100 and detail["context_crop"] == "Rice"
    assert {r["type"] for r in detail["risks"]} == {"drought", "flood", "heat", "pest_disease", "soil"}
    assert client.delete(f"/api/farms/{farm['id']}/records/{rid}", headers=auth("farmer")).status_code == 204


def test_farm_scoping(client, auth, farm):
    hub = client.get(f"/api/predict/recommendations-hub?farm_id={farm['id']}", headers=auth("farmer")).json()
    assert hub["scope"] == "India · Rice"
    risk = client.get(f"/api/risk?farm_id={farm['id']}&crop=Wheat", headers=auth("farmer")).json()
    assert risk["scope"] == "India · Wheat"
    soil = client.get(f"/api/soil/assessment?farm_id={farm['id']}", headers=auth("farmer")).json()
    assert soil["crop_type"] == "Rice"


def test_soil_test_form(client, auth, farm):
    body = {"farm_id": farm["id"], "sampled_on": "2024-03-01", "ph": 6.4, "nitrogen_kg_ha": 120}
    assert client.post("/api/soil-tests", json=body, headers=auth("farmer")).status_code == 201
    tests = client.get(f"/api/soil-tests?farm_id={farm['id']}", headers=auth("farmer")).json()
    assert tests[0]["ph"] == 6.4 and tests[0]["source"] == "form"
    assert client.post("/api/soil-tests", json={**body, "ph": 14}, headers=auth("farmer")).status_code == 422


def _upload(client, headers, kind, text, farm_id=None, name="data.csv"):
    data = {"kind": kind}
    if farm_id is not None:
        data["farm_id"] = str(farm_id)
    return client.post("/api/uploads", data=data, files={"file": (name, io.BytesIO(text.encode()), "text/csv")}, headers=headers)


def test_upload_farm_records_with_validation(client, auth, farm):
    csv = "Season,Crop,Hectares,Yield\n2011,Rice,2,3800\n2012,Banana,2,4000\n2013,Wheat,-1,3000\n"
    up = _upload(client, auth("farmer"), "farm_records", csv, farm["id"])
    assert up.status_code == 201, up.text
    u = up.json()
    assert u["mapping"]["year"] == "Season" and u["mapping"]["crop_type"] == "Crop" and u["mapping"]["area_ha"] == "Hectares"
    val = client.post(f"/api/uploads/{u['id']}/validate", json={"mapping": u["mapping"]}, headers=auth("farmer")).json()
    assert val["report"]["valid_rows"] == 1 and val["report"]["invalid_rows"] == 2
    assert {e["row"] for e in val["report"]["errors"]} == {3, 4}
    imp = client.post(f"/api/uploads/{u['id']}/import", headers=auth("farmer")).json()
    assert imp["status"] == "imported" and imp["report"]["imported_rows"] == 1
    assert len(client.get(f"/api/farms/{farm['id']}/records", headers=auth("farmer")).json()) == 1
    assert client.post(f"/api/uploads/{u['id']}/import", headers=auth("farmer")).status_code == 409


def test_upload_crop_records_requires_agronomist_and_invalidates_cache(client, auth):
    csv = "country,crop,year,yield\nIndia,Rice,2013,5000\n"
    assert _upload(client, auth("farmer"), "crop_records", csv).status_code == 403
    before = client.get("/api/data/summary", headers=auth("agronomist")).json()["total_farms"]
    u = _upload(client, auth("agronomist"), "crop_records", csv).json()
    client.post(f"/api/uploads/{u['id']}/validate", json={"mapping": u["mapping"]}, headers=auth("agronomist"))
    client.post(f"/api/uploads/{u['id']}/import", headers=auth("agronomist"))
    assert client.get("/api/data/summary", headers=auth("agronomist")).json()["total_farms"] == before + 1
    history = client.get("/api/uploads", headers=auth("agronomist")).json()
    assert history["items"][0]["id"] == u["id"]


def test_upload_limits(client, auth):
    assert _upload(client, auth("agronomist"), "weather", "a,b\n1,2", name="data.txt").status_code == 415
    assert _upload(client, auth("agronomist"), "weather", "region,year\n").status_code == 422


def test_profile_edit_and_password_change(client, auth):
    client.post("/api/auth/register", json={"username": "profiler", "email": "p1@example.com", "password": "secret123"})
    tok = client.post("/api/auth/login", json={"username": "profiler", "password": "secret123"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    prefs = {"recommendations": False, "alerts": True, "weather": True, "system": True}
    me = client.patch("/api/auth/me", json={"full_name": "Pro Filer", "notification_prefs": prefs}, headers=h).json()
    assert me["user"]["full_name"] == "Pro Filer" and me["user"]["notification_prefs"]["recommendations"] is False
    assert client.post("/api/auth/change-password", json={"current_password": "wrong", "new_password": "newsecret1"}, headers=h).status_code == 400
    assert client.post("/api/auth/change-password", json={"current_password": "secret123", "new_password": "newsecret1"}, headers=h).status_code == 204
    assert client.post("/api/auth/login", json={"username": "profiler", "password": "newsecret1"}).status_code == 200


def test_sample_record_for_predictor(client, auth):
    r = client.get("/api/data/sample?crop=Rice", headers=auth("farmer")).json()
    assert r["crop_type"] == "Rice" and r["farm_id"]
