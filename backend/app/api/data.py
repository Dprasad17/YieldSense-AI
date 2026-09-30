from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from backend.app.api.schemas import Page, context_filters
from backend.app.core.errors import ERROR_RESPONSES
from backend.app.core.security import require_agronomist, require_user
from backend.app.services import dataset
from backend.app.services.dataset import Filters, filter_df

router = APIRouter(prefix="/api/data", tags=["Dataset Operations"], responses=ERROR_RESPONSES)


class CropRecord(BaseModel):
    farm_id: str
    region: str
    crop_type: str
    year: Optional[int] = None
    yield_kg_per_hectare: float
    rainfall_mm: float
    temperature_C: float
    pesticide_usage_ml: float
    soil_pH: float
    soil_moisture_percent: float = Field(alias="soil_moisture_%")
    humidity_percent: float = Field(alias="humidity_%")
    sunlight_hours: float
    total_days: int
    sowing_date: str
    harvest_date: str
    irrigation_type: str
    fertilizer_type: str
    crop_disease_status: str
    NDVI_index: float

    model_config = {"populate_by_name": True, "serialize_by_alias": True}


class DatasetSummary(BaseModel):
    total_farms: int = Field(description="Number of dataset records (rows)")
    avg_yield_kg_ha: float
    median_yield_kg_ha: float
    avg_rainfall_mm: float
    avg_ndvi: float
    total_regions: int
    crops_supported: list[str]
    regions: list[str]
    year_min: int
    year_max: int
    missing_years: list[int]


def records_to_dicts(df) -> list[dict]:
    out = df.copy()
    out["sowing_date"] = out["sowing_date"].dt.strftime("%Y-%m-%d")
    out["harvest_date"] = out["harvest_date"].dt.strftime("%Y-%m-%d")
    out["year"] = out["year"].astype(object).where(out["year"].notna(), None)
    return out.to_dict(orient="records")


@router.get("/records", response_model=Page[CropRecord])
def get_crop_records(
    f: Filters = Depends(context_filters),
    search: Optional[str] = Query(None, max_length=80, description="Matches farm ID, region or crop"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _user: dict = Depends(require_agronomist),
):
    df = filter_df(f)
    if search and search.strip():
        q = search.strip().lower()
        df = df[
            df["farm_id"].str.lower().str.contains(q, regex=False)
            | df["region"].str.lower().str.contains(q, regex=False)
            | df["crop_type"].str.lower().str.contains(q, regex=False)
        ]
    start = (page - 1) * page_size
    return {
        "items": records_to_dicts(df.iloc[start : start + page_size]),
        "total": int(len(df)),
        "page": page,
        "page_size": page_size,
    }


@router.get("/summary", response_model=DatasetSummary)
def get_dataset_summary(_user: dict = Depends(require_user)):
    df = dataset.get_df()
    lo, hi = dataset.year_range()
    return {
        "total_farms": int(len(df)),
        "avg_yield_kg_ha": round(float(df["yield_kg_per_hectare"].mean()), 2),
        "median_yield_kg_ha": round(float(df["yield_kg_per_hectare"].median()), 2),
        "avg_rainfall_mm": round(float(df["rainfall_mm"].mean()), 2),
        "avg_ndvi": round(float(df["NDVI_index"].mean()), 2),
        "total_regions": int(df["region"].nunique()),
        "crops_supported": dataset.crops(),
        "regions": dataset.regions(),
        "year_min": lo,
        "year_max": hi,
        "missing_years": dataset.missing_years(),
    }
