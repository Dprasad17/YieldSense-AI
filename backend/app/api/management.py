"""Milestone 1 data & user management: farms, farm records, soil tests, farm scoping helpers."""
from datetime import date, datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select

from backend.app.api.schemas import Page
from backend.app.core.errors import ERROR_RESPONSES, AppError
from backend.app.core.security import is_privileged, require_user
from backend.app.db import mongo
from backend.app.db.models import Farm, FarmRecord, User
from backend.app.db.session import session_scope
from backend.app.services import dataset, insights, store
from backend.app.services.dataset import Filters

farms_router = APIRouter(prefix="/api/farms", tags=["Farms"], responses=ERROR_RESPONSES)
soil_tests_router = APIRouter(prefix="/api/soil-tests", tags=["Soil tests"], responses=ERROR_RESPONSES)

IRRIGATION = ("Drip", "Sprinkler", "Flood", "Rainfed")


# ------------------------------------------------------------------ schemas


def canon_region(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    name = dataset.canonical(v, "region")
    if not name:
        raise ValueError("choose a region from the dataset list")
    return name


def canon_crops(v: Optional[list[str]]) -> Optional[list[str]]:
    if v is None:
        return v
    out: list[str] = []
    for c in v:
        name = dataset.canonical(c, "crop_type")
        if not name:
            raise ValueError(f"unknown crop '{c}'")
        if name not in out:
            out.append(name)
    return out


class FarmIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    region: str = Field(min_length=2, max_length=80)
    area_ha: float = Field(gt=0, le=1_000_000)
    crops: list[str] = Field(min_length=1, max_length=10)
    irrigation_type: Optional[Literal["Drip", "Sprinkler", "Flood", "Rainfed"]] = None
    soil_ph: Optional[float] = Field(None, ge=3, le=10)
    soil_moisture_percent: Optional[float] = Field(None, ge=0, le=100)
    soil_type: Optional[str] = Field(None, max_length=40)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    notes: Optional[str] = Field(None, max_length=2000)

    _region = field_validator("region")(lambda cls, v: canon_region(v))
    _crops = field_validator("crops")(lambda cls, v: canon_crops(v))


class FarmPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    region: Optional[str] = None
    area_ha: Optional[float] = Field(None, gt=0, le=1_000_000)
    crops: Optional[list[str]] = Field(None, min_length=1, max_length=10)
    irrigation_type: Optional[Literal["Drip", "Sprinkler", "Flood", "Rainfed"]] = None
    soil_ph: Optional[float] = Field(None, ge=3, le=10)
    soil_moisture_percent: Optional[float] = Field(None, ge=0, le=100)
    soil_type: Optional[str] = Field(None, max_length=40)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    notes: Optional[str] = Field(None, max_length=2000)

    _region = field_validator("region")(lambda cls, v: canon_region(v))
    _crops = field_validator("crops")(lambda cls, v: canon_crops(v))


class FarmOut(BaseModel):
    id: int
    owner: str
    name: str
    region: str
    area_ha: float
    crops: list[str]
    irrigation_type: Optional[str]
    soil_ph: Optional[float]
    soil_moisture_percent: Optional[float]
    soil_type: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    notes: Optional[str]
    record_count: int
    latest_yield_kg_ha: Optional[float]
    created_at: str
    updated_at: str


class FarmRecordIn(BaseModel):
    year: int = Field(ge=1950, le=2100)
    crop_type: str
    area_ha: float = Field(gt=0, le=1_000_000)
    yield_kg_ha: Optional[float] = Field(None, ge=0, le=200_000)
    rainfall_mm: Optional[float] = Field(None, ge=0, le=10_000)
    temperature_c: Optional[float] = Field(None, ge=-30, le=60)
    pesticide_usage_ml: Optional[float] = Field(None, ge=0)
    fertilizer_type: Optional[str] = Field(None, max_length=40)
    fertilizer_kg_ha: Optional[float] = Field(None, ge=0, le=5000)
    irrigation_type: Optional[Literal["Drip", "Sprinkler", "Flood", "Rainfed"]] = None
    notes: Optional[str] = Field(None, max_length=1000)

    _crop = field_validator("crop_type")(lambda cls, v: (canon_crops([v]) or [v])[0])


class FarmRecordOut(FarmRecordIn):
    id: int
    farm_id: int
    crop_type: str
    created_at: str
    updated_at: str


class RiskSummary(BaseModel):
    type: str
    label: str
    level: str
    share_affected: float


class RecommendationSummary(BaseModel):
    id: str
    severity: str
    title: str
    impact_kg_ha: Optional[float]


class FarmDetail(FarmOut):
    records: list[FarmRecordOut]
    predictions: list[dict]
    context_crop: str
    recommendations: list[RecommendationSummary]
    risks: list[RiskSummary]
    reference_mean_kg_ha: Optional[float]


class SoilTestIn(BaseModel):
    farm_id: int
    sampled_on: date
    ph: float = Field(ge=3, le=10)
    moisture_percent: Optional[float] = Field(None, ge=0, le=100)
    nitrogen_kg_ha: Optional[float] = Field(None, ge=0, le=2000)
    phosphorus_kg_ha: Optional[float] = Field(None, ge=0, le=2000)
    potassium_kg_ha: Optional[float] = Field(None, ge=0, le=2000)
    organic_matter_percent: Optional[float] = Field(None, ge=0, le=100)
    organic_carbon_percent: Optional[float] = Field(None, ge=0, le=60)
    lab: Optional[str] = Field(None, max_length=80)
    notes: Optional[str] = Field(None, max_length=1000)


class SoilTestOut(SoilTestIn):
    id: str
    user: str
    source: str
    created_at: str


# ------------------------------------------------------------------ helpers


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def _farm_out(f: Farm, owner: str) -> dict:
    latest = f.records[0] if f.records else None
    return {
        "id": f.id,
        "owner": owner,
        "name": f.name,
        "region": f.region,
        "area_ha": f.area_ha,
        "crops": list(f.crops or []),
        "irrigation_type": f.irrigation_type,
        "soil_ph": f.soil_ph,
        "soil_moisture_percent": f.soil_moisture_percent,
        "soil_type": f.soil_type,
        "latitude": f.latitude,
        "longitude": f.longitude,
        "notes": f.notes,
        "record_count": len(f.records),
        "latest_yield_kg_ha": latest.yield_kg_ha if latest else None,
        "created_at": _iso(f.created_at),
        "updated_at": _iso(f.updated_at),
    }


def _record_out(r: FarmRecord) -> dict:
    return {
        "id": r.id,
        "farm_id": r.farm_id,
        "year": r.year,
        "crop_type": r.crop_type,
        "area_ha": r.area_ha,
        "yield_kg_ha": r.yield_kg_ha,
        "rainfall_mm": r.rainfall_mm,
        "temperature_c": r.temperature_c,
        "pesticide_usage_ml": r.pesticide_usage_ml,
        "fertilizer_type": r.fertilizer_type,
        "fertilizer_kg_ha": r.fertilizer_kg_ha,
        "irrigation_type": r.irrigation_type,
        "notes": r.notes,
        "created_at": _iso(r.created_at),
        "updated_at": _iso(r.updated_at),
    }


def load_farm(s, farm_id: int, user: dict, write: bool = False) -> Farm:
    """Farm the user may see (owner, or any farm for agronomists/admins). Writes: owner or admin."""
    f = s.get(Farm, farm_id)
    if not f:
        raise AppError(404, "Farm not found.")
    owner = s.get(User, f.owner_id)
    is_owner = owner is not None and owner.username.lower() == user["username"].lower()
    if write and not (is_owner or user["role"] == "Admin"):
        raise AppError(403, "Only the farm owner or an administrator can change this farm.")
    if not write and not (is_owner or is_privileged(user)):
        raise AppError(404, "Farm not found.")  # don't reveal other users' farms
    return f


def farm_filters(farm_id: int, user: dict, crop: Optional[str] = None) -> Filters:
    """Region · Crop context for a farm: the farm's region and the given (or first) crop."""
    with session_scope() as s:
        f = load_farm(s, farm_id, user)
        crops = list(f.crops or [])
        chosen = dataset.canonical(crop, "crop_type") if crop else None
        return Filters.of(f.region, chosen or (crops[0] if crops else None))


# ------------------------------------------------------------------ farms


@farms_router.get("", response_model=Page[FarmOut])
def list_farms(
    search: Optional[str] = Query(None, max_length=80),
    region: Optional[str] = Query(None),
    mine: bool = Query(False, description="Only my farms (agronomists and admins see all farms by default)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: dict = Depends(require_user),
):
    with session_scope() as s:
        q = select(Farm, User.username).join(User, User.id == Farm.owner_id)
        if mine or not is_privileged(user):
            q = q.where(func.lower(User.username) == user["username"].lower())
        if search:
            like = f"%{search.strip()}%"
            q = q.where(or_(Farm.name.ilike(like), Farm.region.ilike(like), User.username.ilike(like)))
        if region:
            q = q.where(func.lower(Farm.region) == region.lower())
        total = s.scalar(select(func.count()).select_from(q.subquery())) or 0
        rows = s.execute(q.order_by(Farm.name).limit(page_size).offset((page - 1) * page_size)).all()
        return {"items": [_farm_out(f, u) for f, u in rows], "total": total, "page": page, "page_size": page_size}


@farms_router.post("", response_model=FarmOut, status_code=201)
def create_farm(body: FarmIn, user: dict = Depends(require_user)):
    with session_scope() as s:
        owner = s.scalar(select(User).where(func.lower(User.username) == user["username"].lower()))
        assert owner is not None
        f = Farm(owner_id=owner.id, **body.model_dump())
        s.add(f)
        s.flush()
        s.refresh(f)
        return _farm_out(f, owner.username)


@farms_router.get("/{farm_id}", response_model=FarmDetail)
def get_farm(farm_id: int, crop: Optional[str] = Query(None), user: dict = Depends(require_user)):
    with session_scope() as s:
        f = load_farm(s, farm_id, user)
        owner = s.get(User, f.owner_id)
        out = _farm_out(f, owner.username if owner else "")
        out["records"] = [_record_out(r) for r in f.records]
    ctx = farm_filters(farm_id, user, crop)
    owner_filter = None if is_privileged(user) else user["username"]
    out["predictions"] = store.list_predictions(owner_filter, 1, 20, farm_id=farm_id)["items"]
    out["context_crop"] = ctx.crop or ""
    df = dataset.filter_df(ctx)
    out["reference_mean_kg_ha"] = round(float(df["yield_kg_per_hectare"].mean()), 2) if len(df) else None
    if len(df):
        recs = insights.recommendations(ctx)["recommendations"]
        out["recommendations"] = [{"id": r["id"], "severity": r["severity"], "title": r["title"], "impact_kg_ha": r["impact_kg_ha"]} for r in recs[:5]]
        out["risks"] = [{"type": r["type"], "label": r["label"], "level": r["level"], "share_affected": r["share_affected"]} for r in insights.risk_assessment(ctx)["risks"]]
    else:
        out["recommendations"], out["risks"] = [], []
    return out


@farms_router.patch("/{farm_id}", response_model=FarmOut)
def update_farm(farm_id: int, body: FarmPatch, user: dict = Depends(require_user)):
    with session_scope() as s:
        f = load_farm(s, farm_id, user, write=True)
        for k, v in body.model_dump(exclude_unset=True).items():
            setattr(f, k, v)
        s.flush()
        owner = s.get(User, f.owner_id)
        return _farm_out(f, owner.username if owner else "")


@farms_router.delete("/{farm_id}", status_code=204)
def delete_farm(farm_id: int, user: dict = Depends(require_user)):
    with session_scope() as s:
        s.delete(load_farm(s, farm_id, user, write=True))
    try:
        mongo.db().soil_tests.delete_many({"farm_id": farm_id})
    except Exception:
        pass


# ------------------------------------------------------------------ farm records


@farms_router.get("/{farm_id}/records", response_model=list[FarmRecordOut])
def list_farm_records(farm_id: int, user: dict = Depends(require_user)):
    with session_scope() as s:
        return [_record_out(r) for r in load_farm(s, farm_id, user).records]


@farms_router.post("/{farm_id}/records", response_model=FarmRecordOut, status_code=201)
def add_farm_record(farm_id: int, body: FarmRecordIn, user: dict = Depends(require_user)):
    with session_scope() as s:
        load_farm(s, farm_id, user, write=True)
        r = FarmRecord(farm_id=farm_id, **body.model_dump())
        s.add(r)
        s.flush()
        s.refresh(r)
        return _record_out(r)


@farms_router.patch("/{farm_id}/records/{record_id}", response_model=FarmRecordOut)
def update_farm_record(farm_id: int, record_id: int, body: FarmRecordIn, user: dict = Depends(require_user)):
    with session_scope() as s:
        load_farm(s, farm_id, user, write=True)
        r = s.get(FarmRecord, record_id)
        if not r or r.farm_id != farm_id:
            raise AppError(404, "Record not found.")
        for k, v in body.model_dump().items():
            setattr(r, k, v)
        s.flush()
        return _record_out(r)


@farms_router.delete("/{farm_id}/records/{record_id}", status_code=204)
def delete_farm_record(farm_id: int, record_id: int, user: dict = Depends(require_user)):
    with session_scope() as s:
        load_farm(s, farm_id, user, write=True)
        r = s.get(FarmRecord, record_id)
        if not r or r.farm_id != farm_id:
            raise AppError(404, "Record not found.")
        s.delete(r)


# ------------------------------------------------------------------ soil tests (MongoDB)


def _soil_out(doc: dict) -> dict:
    d = {k: v for k, v in doc.items() if k != "_id"}
    d["id"] = str(doc["_id"])
    d["sampled_on"] = str(doc["sampled_on"])[:10]
    d["created_at"] = doc["created_at"].isoformat(timespec="seconds") if isinstance(doc.get("created_at"), datetime) else str(doc.get("created_at"))
    return d


def save_soil_test(body: dict, username: str, source: str = "form", upload_id: Optional[str] = None) -> dict:
    import uuid

    doc = {**body, "_id": uuid.uuid4().hex, "sampled_on": str(body["sampled_on"]), "user": username, "source": source, "upload_id": upload_id, "created_at": datetime.now(timezone.utc)}
    mongo.db().soil_tests.insert_one(doc)
    return _soil_out(doc)


@soil_tests_router.get("", response_model=list[SoilTestOut])
def list_soil_tests(farm_id: int = Query(...), user: dict = Depends(require_user)):
    with session_scope() as s:
        load_farm(s, farm_id, user)
    return [_soil_out(d) for d in mongo.db().soil_tests.find({"farm_id": farm_id}).sort("sampled_on", -1).limit(200)]


@soil_tests_router.post("", response_model=SoilTestOut, status_code=201)
def create_soil_test(body: SoilTestIn, user: dict = Depends(require_user)):
    with session_scope() as s:
        load_farm(s, body.farm_id, user, write=True)
    return save_soil_test(body.model_dump(), user["username"])


# ------------------------------------------------------------------ real soil (SoilGrids + soil tests)


class SoilProperty(BaseModel):
    label: str
    unit: str
    value_0_30cm: float
    by_depth: dict[str, float]


class NutrientRating(BaseModel):
    nutrient: str
    label: str
    unit: str
    value: Optional[float]
    rating: Optional[Literal["Low", "Medium", "High"]]
    low_below: float
    high_above: float
    guidance: Optional[str]
    oxide_equivalent: Optional[str] = None


class RatedSoilTest(BaseModel):
    id: str
    sampled_on: str
    lab: Optional[str] = None
    ratings: list[NutrientRating]


class FarmSoil(BaseModel):
    farm_id: int
    source: str
    location: dict
    fetched_at: str
    cached: bool
    properties: dict[str, SoilProperty]
    assessment: dict
    soil_tests: list[RatedSoilTest]
    nutrient_source: str


@farms_router.get("/{farm_id}/soil", response_model=FarmSoil)
def get_farm_soil(farm_id: int, user: dict = Depends(require_user)):
    """Real soil for a farm: ISRIC SoilGrids (0–30 cm) at the farm (or its region's reference point) plus
    the farm's soil tests rated against Soil Health Card limits. 502 if SoilGrids is unreachable; the
    synthetic dataset columns are never used here."""
    from backend.app.services import soil_real
    from backend.app.services.weather_service import LiveWeatherUnavailable, weather_service

    with session_scope() as s:
        f = load_farm(s, farm_id, user)
        lat, lon, region, crops, name = f.latitude, f.longitude, f.region, list(f.crops or []), f.name
    if lat is not None and lon is not None:
        location = {"latitude": lat, "longitude": lon, "basis": "farm coordinates", "label": name}
    else:
        try:
            c = weather_service._coordinates(region)
        except LiveWeatherUnavailable as e:
            raise AppError(422, f"Add coordinates to this farm: {e}", code="no_coordinates")
        location = {"latitude": c["lat"], "longitude": c["lon"], "basis": "region reference point (farm has no coordinates)", "label": c["name"]}
    try:
        soil = soil_real.fetch_soilgrids(location["latitude"], location["longitude"])
    except soil_real.SoilGridsUnavailable as e:
        raise AppError(502, str(e), code="soilgrids_unavailable")
    tests = [_soil_out(d) for d in mongo.db().soil_tests.find({"farm_id": farm_id}).sort("sampled_on", -1).limit(20)]
    return {
        "farm_id": farm_id,
        "source": "real (SoilGrids)",
        "location": location,
        "fetched_at": soil["fetched_at"],
        "cached": soil["cached"],
        "properties": soil["properties"],
        "assessment": soil_real.farm_soil_assessment(soil, tests, crops),
        "soil_tests": [{"id": t["id"], "sampled_on": t["sampled_on"], "lab": t.get("lab"), "ratings": soil_real.nutrient_ratings(t)} for t in tests],
        "nutrient_source": soil_real.NUTRIENT_SOURCE,
    }
