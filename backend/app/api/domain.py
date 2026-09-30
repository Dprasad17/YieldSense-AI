"""Farms, risk, notifications, soil, weather and admin endpoints."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from backend.app.api.data import CropRecord, records_to_dicts
from backend.app.api.predictions import PredictionRecord
from backend.app.api.schemas import Page, context_filters
from backend.app.core.errors import ERROR_RESPONSES, AppError
from backend.app.core.security import is_privileged, require_admin, require_user
from backend.app.services import insights, notifications, store
from backend.app.services.dataset import Filters, filter_df, get_df
from backend.app.services.users import ROLES, load_users, public_user, upsert_user
from backend.app.services.weather_service import LiveWeatherUnavailable, weather_service

farms_router = APIRouter(prefix="/api/farms", tags=["Farms"], responses=ERROR_RESPONSES)
risk_router = APIRouter(prefix="/api/risk", tags=["Risk"], responses=ERROR_RESPONSES)
notifications_router = APIRouter(prefix="/api/notifications", tags=["Notifications"], responses=ERROR_RESPONSES)
soil_router = APIRouter(prefix="/api/soil", tags=["Soil Analytics"], responses=ERROR_RESPONSES)
weather_router = APIRouter(prefix="/api/weather", tags=["Weather Analytics"], responses=ERROR_RESPONSES)
admin_router = APIRouter(prefix="/api/admin", tags=["Admin"], responses=ERROR_RESPONSES)


# ------------------------------------------------------------------ farms


class FarmSummary(BaseModel):
    farm_id: str
    region: str
    crop_type: str
    year: Optional[int]
    yield_kg_ha: float
    ndvi: float


class FarmDetail(BaseModel):
    farm_id: str
    note: str
    records: list[CropRecord]
    avg_yield_kg_ha: float
    region_crop_mean_kg_ha: Optional[float]
    crop_mean_kg_ha: float
    crop_percentile: float
    predictions: list[PredictionRecord]


@farms_router.get("", response_model=Page[FarmSummary])
def list_farms(
    f: Filters = Depends(context_filters),
    search: Optional[str] = Query(None, max_length=40),
    sort: Literal["farm_id", "yield_desc", "yield_asc"] = Query("farm_id"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _user: dict = Depends(require_user),
):
    df = filter_df(f)
    if search:
        df = df[df["farm_id"].str.contains(search.strip(), case=False, regex=False)]
    if sort == "farm_id":
        df = df.sort_values("farm_id")
    else:
        df = df.sort_values("yield_kg_per_hectare", ascending=sort == "yield_asc")
    start = (page - 1) * page_size
    items = [
        {
            "farm_id": r.farm_id,
            "region": r.region,
            "crop_type": r.crop_type,
            "year": int(r.year) if r.year == r.year else None,
            "yield_kg_ha": round(float(r.yield_kg_per_hectare), 2),
            "ndvi": float(r.NDVI_index),
        }
        for r in df.iloc[start : start + page_size].itertuples()
    ]
    return {"items": items, "total": int(len(df)), "page": page, "page_size": page_size}


@farms_router.get("/{farm_id}", response_model=FarmDetail)
def get_farm(farm_id: str, user: dict = Depends(require_user)):
    df = get_df()
    rows = df[df["farm_id"].str.upper() == farm_id.strip().upper()]
    if rows.empty:
        raise AppError(404, f"Farm {farm_id} not found.")
    row = rows.iloc[0]
    crop_yields = df.loc[df["crop_type"] == row["crop_type"], "yield_kg_per_hectare"]
    peers = df[(df["crop_type"] == row["crop_type"]) & (df["region"] == row["region"])]["yield_kg_per_hectare"]
    owner = None if is_privileged(user) else user["username"]
    preds = store.list_predictions(owner, 1, 50, farm_id=str(row["farm_id"]))["items"]
    return {
        "farm_id": row["farm_id"],
        "note": "Each farm ID in the dataset is a single region × crop × year record.",
        "records": records_to_dicts(rows),
        "avg_yield_kg_ha": round(float(rows["yield_kg_per_hectare"].mean()), 2),
        "region_crop_mean_kg_ha": round(float(peers.mean()), 2) if len(peers) else None,
        "crop_mean_kg_ha": round(float(crop_yields.mean()), 2),
        "crop_percentile": round(float((crop_yields <= row["yield_kg_per_hectare"]).mean() * 100), 1),
        "predictions": preds,
    }


# ------------------------------------------------------------------ risk


class RiskItem(BaseModel):
    type: Literal["drought", "flood", "heat", "pest_disease", "soil"]
    label: str
    trigger: str
    share_affected: float
    median_yield_loss_pct: float
    likelihood: int
    impact: int
    score: int
    level: Literal["Low", "Moderate", "High", "Critical"]
    mitigation: str
    recommendation_category: str


class RiskYear(BaseModel):
    year: int
    drought: float
    flood: float
    heat: float
    pest_disease: float
    soil: float


class Anomaly(BaseModel):
    farm_id: str
    region: str
    crop_type: str
    year: int
    yield_kg_ha: float
    crop_mean_kg_ha: float
    z_score: float
    direction: Literal["high", "low"]


class RiskAssessment(BaseModel):
    scope: str
    record_count: int
    risks: list[RiskItem]
    timeline: list[RiskYear]
    anomalies: list[Anomaly]
    method: str


@risk_router.get("", response_model=RiskAssessment)
def get_risk(f: Filters = Depends(context_filters), user: dict = Depends(require_user)):
    result = insights.risk_assessment(f)
    notifications.sync_risk(user["username"], f, result["risks"])
    return result


# ------------------------------------------------------------------ notifications


class Notification(BaseModel):
    id: str
    username: str
    category: Literal["alerts", "weather", "recommendations", "system"]
    severity: str
    title: str
    body: str
    link: Optional[str]
    created_at: str
    read_at: Optional[str]
    read: bool


class NotificationPage(Page[Notification]):
    unread_count: int


class ReadRequest(BaseModel):
    read: bool = True


class ReadAllResponse(BaseModel):
    updated: int


@notifications_router.get("", response_model=NotificationPage)
def list_notifications(
    f: Filters = Depends(context_filters),
    category: Optional[Literal["alerts", "weather", "recommendations", "system"]] = Query(None),
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: dict = Depends(require_user),
):
    """Passing region/crop first syncs notifications for that context (deduplicated)."""
    if f.region or f.crop:
        notifications.sync_context(user["username"], f)
    return store.list_notifications(user["username"], page, page_size, category, unread_only)


@notifications_router.patch("/read-all", response_model=ReadAllResponse)
def mark_all_read(user: dict = Depends(require_user)):
    return {"updated": store.mark_all_read(user["username"])}


@notifications_router.patch("/{notification_id}", response_model=Notification)
def set_read(notification_id: str, body: ReadRequest, user: dict = Depends(require_user)):
    item = store.set_notification_read(user["username"], notification_id, body.read)
    if not item:
        raise AppError(404, "Notification not found.")
    return item


# ------------------------------------------------------------------ soil


class SoilGuidance(BaseModel):
    status: Literal["optimal", "watch", "critical"]
    finding: str
    action: str
    why: str


class CropSuitability(BaseModel):
    crop: str
    suitability_index: float
    reasons: list[str]


class SoilAssessment(BaseModel):
    status_claim: str
    crop_type: str
    scope: str
    soil_metrics: dict[str, float | int | str]
    global_soil_averages: dict[str, float]
    guidance: list[SoilGuidance]
    crop_suitability: list[CropSuitability]
    general_reference_note: str


@soil_router.get("/assessment", response_model=SoilAssessment)
def get_soil_assessment(f: Filters = Depends(context_filters), crop_type: Optional[str] = Query(None),
                        _user: dict = Depends(require_user)):
    if crop_type and not f.crop:
        f = context_filters(region=f.region, crop=crop_type, year_from=f.year_from, year_to=f.year_to)
    if not f.crop:
        raise AppError(422, "crop: choose a crop for the soil assessment.", code="validation_error")
    try:
        return insights.soil_assessment(f)
    except ValueError as e:
        raise AppError(404, str(e))


# ------------------------------------------------------------------ weather


class WeatherForecastDay(BaseModel):
    date: str
    temp_max_C: float
    temp_min_C: float
    precipitation_mm: float
    sunshine_hours: float


class WeatherCurrent(BaseModel):
    temperature_C: float
    humidity_percent: float
    precipitation_mm: float
    wind_speed_kmh: float
    observed_at: Optional[str]


class WeatherResponse(BaseModel):
    mode: Literal["dataset", "live"]
    status_claim: str
    data_source: str
    period: str
    region: str
    analytics: dict[str, Optional[float]]
    available_regions: list[str]
    current: Optional[WeatherCurrent]
    forecast: list[WeatherForecastDay]
    fetched_at: Optional[str]


@weather_router.get("/analysis", response_model=WeatherResponse)
def get_weather_analysis(region: Optional[str] = Query(None), live: bool = Query(False),
                         _user: dict = Depends(require_user)):
    try:
        return weather_service.get_weather_analytics(region=region, live=live)
    except LiveWeatherUnavailable as e:
        raise AppError(502, str(e), code="live_weather_unavailable")
    except FileNotFoundError as e:
        raise AppError(503, str(e))
    except ValueError as e:
        raise AppError(404, str(e))


# ------------------------------------------------------------------ admin


class AdminUser(BaseModel):
    username: str
    email: str
    full_name: str
    role: Literal["Farmer", "Agronomist", "Admin"]
    active: bool


class UserPatch(BaseModel):
    role: Optional[Literal["Farmer", "Agronomist", "Admin"]] = None
    active: Optional[bool] = None


class AuditEntry(BaseModel):
    id: str
    actor: str
    action: str
    target: str
    detail: dict
    created_at: str


@admin_router.get("/users", response_model=Page[AdminUser])
def admin_list_users(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                     _admin: dict = Depends(require_admin)):
    users = sorted((public_user(u) for u in load_users().values()), key=lambda u: u["username"])
    start = (page - 1) * page_size
    return {"items": users[start : start + page_size], "total": len(users), "page": page, "page_size": page_size}


@admin_router.patch("/users/{username}", response_model=AdminUser)
def admin_update_user(username: str, body: UserPatch, admin: dict = Depends(require_admin)):
    users = load_users()
    user = users.get(username.lower())
    if not user:
        raise AppError(404, "User not found.")
    is_self = user["username"].lower() == admin["username"].lower()
    if is_self and body.role is not None and body.role != "Admin":
        raise AppError(409, "You can't remove your own admin role.", code="self_demotion")
    if is_self and body.active is False:
        raise AppError(409, "You can't deactivate your own account.", code="self_deactivation")

    updated = dict(user)
    if body.role is not None and body.role != user["role"]:
        assert body.role in ROLES
        store.audit(admin["username"], "role_changed", user["username"], {"from": user["role"], "to": body.role})
        updated["role"] = body.role
    if body.active is not None and body.active != user.get("active", True):
        store.audit(admin["username"], "activated" if body.active else "deactivated", user["username"], {})
        updated["active"] = body.active
    upsert_user(updated)
    return public_user(updated)


@admin_router.get("/audit", response_model=Page[AuditEntry])
def admin_audit(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                _admin: dict = Depends(require_admin)):
    return store.list_audit(page, page_size)
