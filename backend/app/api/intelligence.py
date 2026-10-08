"""Next-level features: assistant, satellite crop health, market revenue, leaf check, digests, model monitoring."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Header, Query, Security, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from backend.app.core.config import settings
from backend.app.core.errors import ERROR_RESPONSES, AppError
from backend.app.core.security import require_admin, require_agronomist, require_user, security_bearer
from backend.app.db.session import session_scope
from backend.app.services import dataset

assistant_router = APIRouter(prefix="/api/assistant", tags=["Assistant"], responses=ERROR_RESPONSES)
satellite_router = APIRouter(prefix="/api/farms", tags=["Satellite"], responses=ERROR_RESPONSES)
market_router = APIRouter(prefix="/api/market", tags=["Market"], responses=ERROR_RESPONSES)
disease_router = APIRouter(prefix="/api/disease", tags=["Leaf check"], responses=ERROR_RESPONSES)
ops_router = APIRouter(prefix="/api/admin", tags=["Admin"], responses=ERROR_RESPONSES)
digest_router = APIRouter(prefix="/api/notifications/digest", tags=["Notifications"], responses=ERROR_RESPONSES)


# ------------------------------------------------------------------ assistant


class AskIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    page: Optional[str] = Field(None, max_length=60, description="App page the question was asked from")


class AskOut(BaseModel):
    answer: str
    provider: str
    context_lines: int


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: str


class AssistantStatus(BaseModel):
    available: bool
    provider: Optional[str]


@assistant_router.get("/status", response_model=AssistantStatus)
def assistant_status(_user: dict = Depends(require_user)):
    from backend.app.services.llm_service import llm_service

    ok = bool(llm_service.groq_api_key)
    return {"available": ok, "provider": f"Groq · {llm_service.groq_model}" if ok else None}


@assistant_router.get("/history", response_model=list[ChatMessage])
def assistant_history(user: dict = Depends(require_user)):
    from backend.app.services import assistant

    return assistant.history(user["username"])


@assistant_router.delete("/history", status_code=204)
def assistant_clear(user: dict = Depends(require_user)):
    from backend.app.services import assistant

    assistant.clear(user["username"])


@assistant_router.post("/ask", response_model=AskOut)
def assistant_ask(body: AskIn, user: dict = Depends(require_user)):
    """Answers a question from the user's own farms, predictions, tasks and risk summaries (Groq LLM)."""
    from backend.app.services import assistant

    try:
        return assistant.ask(user["username"], body.message.strip(), body.page)
    except assistant.AssistantUnavailable as e:
        raise AppError(503, str(e), code="assistant_unavailable")


# ------------------------------------------------------------------ satellite


class NdviPoint(BaseModel):
    date: str
    ndvi: Optional[float]
    ndvi_last_year: Optional[float]


class FarmNdvi(BaseModel):
    farm_id: int
    source: str
    latitude: float
    longitude: float
    location_basis: str
    points: list[NdviPoint]
    latest: Optional[dict]
    change_vs_last_year_pct: Optional[float]
    status: Literal["good", "watch", "alert", "unknown"]
    message: str
    note: str


@satellite_router.get("/{farm_id}/ndvi", response_model=FarmNdvi)
def farm_ndvi(farm_id: int, user: dict = Depends(require_user)):
    """Satellite vegetation index (MODIS NDVI) at the farm for the last 12 months vs the year before."""
    from backend.app.api.management import load_farm
    from backend.app.services import satellite
    from backend.app.services.weather_service import LiveWeatherUnavailable, weather_service

    with session_scope() as s:
        f = load_farm(s, farm_id, user)
        lat, lon, region = f.latitude, f.longitude, f.region
    basis = "farm coordinates"
    if lat is None or lon is None:
        try:
            c = weather_service._coordinates(region)
        except LiveWeatherUnavailable:
            raise AppError(422, "Add coordinates to this farm to see satellite data.", code="no_coordinates")
        lat, lon, basis = c["lat"], c["lon"], "region reference point (farm has no coordinates)"
    try:
        data = satellite.ndvi_profile(float(lat), float(lon))
    except satellite.SatelliteUnavailable as e:
        raise AppError(502, str(e), code="satellite_unavailable")
    return {"farm_id": farm_id, "location_basis": basis, **data}


# ------------------------------------------------------------------ market


class CropRevenue(BaseModel):
    crop: str
    predicted_yield_kg_ha: float
    low_kg_ha: float
    high_kg_ha: float
    price_usd_per_tonne: Optional[float]
    price_basis: str
    revenue_usd_per_ha: Optional[float]
    revenue_low_usd_per_ha: Optional[float]
    revenue_high_usd_per_ha: Optional[float]
    revenue_usd_farm: Optional[float]


class CropEconomics(BaseModel):
    region: str
    season: int
    basis_year: int
    area_ha: Optional[float]
    items: list[CropRevenue]
    price_source: Optional[str]
    note: str


@market_router.get("/crop-economics", response_model=CropEconomics)
def crop_economics(
    region: Optional[str] = Query(None, max_length=80),
    farm_id: Optional[int] = Query(None, description="Use a farm's region, crops and area"),
    user: dict = Depends(require_user),
):
    """Expected gross revenue per hectare for each crop: next-season model yield × FAOSTAT producer price."""
    from backend.app.services import market

    area, crops = None, None
    if farm_id is not None:
        from backend.app.api.management import load_farm

        with session_scope() as s:
            f = load_farm(s, farm_id, user)
            region, area, crops = f.region, f.area_ha, list(f.crops or []) or None
    name = dataset.canonical(region, "region") if region else None
    if not name:
        raise AppError(422, "Choose a region from the dataset list or one of your farms.", code="bad_region")
    try:
        return market.crop_economics(name, area, crops)
    except ValueError as e:
        raise AppError(404, str(e))
    except RuntimeError as e:
        raise AppError(503, str(e))


# ------------------------------------------------------------------ leaf check


class LeafClass(BaseModel):
    label: str
    plant: str
    disease: str
    probability: float


class LeafResult(BaseModel):
    source: str
    top: list[LeafClass]
    confident: bool
    healthy: bool
    advice: str
    note: str


@disease_router.post("/classify", response_model=LeafResult)
async def classify_leaf(file: UploadFile = File(...), _user: dict = Depends(require_user)):
    """Classifies one leaf photo into 38 PlantVillage classes (14 plants). A first check, not a diagnosis."""
    from backend.app.services import disease

    if file.content_type and not file.content_type.startswith("image/"):
        raise AppError(415, "Upload an image (JPEG or PNG).", code="not_an_image")
    data = await file.read(disease.MAX_BYTES + 1)
    try:
        return disease.classify(data)
    except ValueError as e:
        raise AppError(400, str(e), code="bad_image")
    except disease.DiseaseModelUnavailable as e:
        raise AppError(503, str(e), code="model_unavailable")


@disease_router.get("/classes", response_model=list[str])
def leaf_classes(_user: dict = Depends(require_user)):
    from backend.app.services import disease

    try:
        return disease.labels()
    except disease.DiseaseModelUnavailable as e:
        raise AppError(503, str(e), code="model_unavailable")


# ------------------------------------------------------------------ digests and model monitoring


class DigestResult(BaseModel):
    email: int
    sms: int
    skipped: int
    failed: int
    at: str


class Channels(BaseModel):
    email: bool
    sms: bool


@digest_router.get("/channels", response_model=Channels)
def digest_channels(_user: dict = Depends(require_user)):
    """Which digest channels the server is configured for (so Settings can show the right options)."""
    from backend.app.services import messaging

    return messaging.channels()


@ops_router.post("/digests/send", response_model=DigestResult)
def send_digests(
    x_cron_token: Optional[str] = Header(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
):
    """Sends the weekly digest to every user who opted in. Called by an administrator, or by a scheduled
    job with the X-Cron-Token header (CRON_TOKEN)."""
    from backend.app.services import messaging

    if not (settings.CRON_TOKEN and x_cron_token == settings.CRON_TOKEN):
        require_admin(require_user(credentials))
    return messaging.send_digests()


@ops_router.get("/model-monitoring")
def model_monitoring(_user: dict = Depends(require_agronomist)) -> dict:
    """Model registry (versions and their held-out metrics) and input drift of recent predictions."""
    from backend.app.services import monitoring

    return monitoring.report()


@digest_router.post("/send-me", response_model=DigestResult)
def send_my_digest(user: dict = Depends(require_user)):
    """Sends the digest to the signed-in user now (if they opted in and a channel is configured)."""
    from backend.app.services import messaging

    return messaging.send_digests(only_user=user["username"])

