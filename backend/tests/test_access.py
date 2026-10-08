"""Every /api route requires a token except the public ones; role gates follow the permissions map."""
import pytest

PUBLIC = {"/api/auth/login", "/api/auth/register", "/api/health", "/api/public/stats"}

FARMER_OK = [
    "/api/data/summary",
    "/api/analytics/metrics",
    "/api/analytics/regions",
    "/api/analytics/seasonal-trends?region=India&crop=Rice",
    "/api/analytics/farm-comparison?region=India",
    "/api/predict/models/active",
    "/api/predict/recommendations-hub?region=India&crop=Rice",
    "/api/predictions",
    "/api/recommendations/tasks",
    "/api/weather/analysis?region=India",
    "/api/soil/assessment?crop=Rice",
    "/api/farms",
    "/api/uploads",
    "/api/data/sample",
    "/api/auth/me",
    "/api/risk?region=India",
    "/api/notifications",
    "/api/analytics/my-farms",
    "/api/data/provenance",
]
AGRONOMIST_ONLY = ["/api/data/records", "/api/analytics/eda-charts", "/api/predict/models"]
ADMIN_ONLY = ["/api/admin/users", "/api/admin/audit", "/api/admin/metrics"]


def test_every_api_route_is_protected(client):
    from backend.app.main import app

    checked = 0
    for path, ops in app.openapi()["paths"].items():
        if not path.startswith("/api") or path in PUBLIC:
            continue
        concrete = path.replace("{", "").replace("}", "")
        for method in ops:
            res = client.request(method.upper(), concrete, json={})
            assert res.status_code == 401, f"{method.upper()} {path} returned {res.status_code} without a token"
            checked += 1
    assert checked > 40


def test_public_stats_is_aggregate_only(client):
    body = client.get("/api/public/stats").json()
    assert body["record_count"] == 28242 and body["crop_count"] == 10 and body["region_count"] == 101
    assert body["model_name"] == "XGBoost"
    assert set(body) == {"record_count", "crop_count", "region_count", "year_min", "year_max", "model_name", "r2", "rmse", "mae"}


@pytest.mark.parametrize("role", ["farmer", "agronomist", "admin"])
@pytest.mark.parametrize("path", FARMER_OK)
def test_every_role_allowed(client, auth, path, role):
    assert client.get(path, headers=auth(role)).status_code == 200, (role, path)


@pytest.mark.parametrize("path", AGRONOMIST_ONLY)
def test_agronomist_gates(client, auth, path):
    assert client.get(path, headers=auth("farmer")).status_code == 403
    assert client.get(path, headers=auth("agronomist")).status_code == 200
    assert client.get(path, headers=auth("admin")).status_code == 200


@pytest.mark.parametrize("path", ADMIN_ONLY)
def test_admin_gates(client, auth, path):
    assert client.get(path, headers=auth("farmer")).status_code == 403
    assert client.get(path, headers=auth("agronomist")).status_code == 403
    assert client.get(path, headers=auth("admin")).status_code == 200


WRITE_GATES = [
    ("patch", "/api/admin/users/farmer", {"role": "Agronomist"}, {"farmer", "agronomist"}),
]


@pytest.mark.parametrize("method,path,body,denied", WRITE_GATES)
def test_write_gates(client, auth, method, path, body, denied):
    for role in denied:
        assert client.request(method.upper(), path, json=body, headers=auth(role)).status_code == 403, role


def test_uploads_reject_privileged_kinds_for_farmers(client, auth):
    files = {"file": ("r.csv", b"a,b\n1,2\n", "text/csv")}
    res = client.post("/api/uploads", data={"kind": "crop_records"}, files=files, headers=auth("farmer"))
    assert res.status_code == 403


def test_request_id_and_timing_headers(client):
    res = client.get("/api/health")
    assert len(res.headers["X-Request-ID"]) >= 8 and res.headers["Server-Timing"].startswith("app;dur=")
    res = client.get("/api/health", headers={"X-Request-ID": "trace-abc-123"})
    assert res.headers["X-Request-ID"] == "trace-abc-123"
    res = client.get("/api/health", headers={"X-Request-ID": "bad id with spaces"})
    assert res.headers["X-Request-ID"] != "bad id with spaces"
    body = res.json()
    assert body["status"] == "healthy" and body["checks"] == {"database": True, "mongo": True, "model_loaded": True}


def test_admin_system_metrics(client, auth):
    client.post(
        "/api/predict/what-if",
        json={"crop_type": "Rice", "region": "India", "rainfall_mm": 1100, "temperature_C": 25, "pesticide_usage_ml": 450, "total_days": 130},
        headers=auth("farmer"),
    )
    m = client.get("/api/admin/metrics", headers=auth("admin")).json()
    assert m["api"]["requests_total"] > 0 and m["api"]["overall"]["p95_ms"] is not None
    assert m["inference"]["count"] >= 1 and m["inference"]["p50_ms"] is not None
    assert m["database"]["crop_records"] == 28242 and m["model"]["name"] == "XGBoost"
    assert m["api"]["routes"] and all(r["route"].split(" ")[0] in {"GET", "POST", "PATCH", "DELETE"} for r in m["api"]["routes"])


def test_effectiveness_and_processing_metrics(client, auth):
    hub = client.get("/api/predict/recommendations-hub?region=India&crop=Rice", headers=auth("farmer")).json()
    rec = hub["recommendations"][0]
    client.post(f"/api/recommendations/{rec['id']}/actions", json={"action": "create_task"}, headers=auth("farmer"))
    client.post(f"/api/recommendations/{rec['id']}/actions", json={"action": "done"}, headers=auth("farmer"))
    farm = client.get("/api/farms", headers=auth("farmer")).json()["items"][0]["id"]
    files = {"file": ("s.csv", b"Season,Crop,Hectares,Yield\n2008,Rice,4,3500\n", "text/csv")}
    up = client.post("/api/uploads", data={"kind": "farm_records", "farm_id": farm}, files=files, headers=auth("farmer")).json()
    client.post(f"/api/uploads/{up['id']}/validate", json={"mapping": up["mapping"]}, headers=auth("farmer"))
    client.post(f"/api/uploads/{up['id']}/import", headers=auth("farmer"))
    m = client.get("/api/admin/metrics", headers=auth("admin")).json()
    r = m["recommendations"]
    assert r["tasks"] >= 1 and r["done"] >= 1 and 0 < r["completion_rate"] <= 1
    assert any(u["username"] == "farmer" and u["done"] >= 1 for u in r["per_user"])
    assert "seasons" in r["outcome_note"]
    p = m["processing"]
    assert p["available"] and p["validations_measured"] >= 1 and p["imports_measured"] >= 1
    assert p["validation_ms_per_row_median"] > 0 and p["import_rows_per_sec_median"] > 0


def test_hosted_postgres_urls_are_normalized_for_psycopg():
    from backend.app.core.config import normalize_database_url

    assert normalize_database_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_database_url("postgresql://u:p@h/db?sslmode=require") == "postgresql+psycopg://u:p@h/db?sslmode=require"
    assert normalize_database_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
