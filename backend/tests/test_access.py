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
    "/api/risk?region=India",
    "/api/notifications",
]
AGRONOMIST_ONLY = ["/api/data/records", "/api/analytics/eda-charts", "/api/predict/models"]
ADMIN_ONLY = ["/api/admin/users", "/api/admin/audit"]


def test_every_api_route_is_protected(client):
    from backend.app.main import app

    for route in app.routes:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", set()) or set()
        if not path.startswith("/api") or path in PUBLIC:
            continue
        concrete = path.replace("{", "").replace("}", "")
        for method in methods - {"HEAD", "OPTIONS"}:
            res = client.request(method, concrete, json={})
            assert res.status_code == 401, f"{method} {path} returned {res.status_code} without a token"


def test_public_stats_is_aggregate_only(client):
    body = client.get("/api/public/stats").json()
    assert body["record_count"] == 28242 and body["crop_count"] == 10 and body["region_count"] == 101
    assert body["model_name"] == "Random Forest (GridSearchCV)"
    assert set(body) == {"record_count", "crop_count", "region_count", "year_min", "year_max", "model_name", "r2", "rmse", "mae"}


@pytest.mark.parametrize("path", FARMER_OK)
def test_farmer_allowed(client, auth, path):
    assert client.get(path, headers=auth("farmer")).status_code == 200, path


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
