"""Unauthenticated, aggregate-only endpoints for the public landing page. No row-level data."""
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from backend.app.services import dataset
from backend.app.services.ml_service import active_model_summary

router = APIRouter(prefix="/api/public", tags=["Public"])


class PublicStats(BaseModel):
    record_count: int
    crop_count: int
    region_count: int
    year_min: int
    year_max: int
    model_name: Optional[str]
    r2: Optional[float]
    rmse: Optional[float]
    mae: Optional[float]


@router.get("/stats", response_model=PublicStats)
def public_stats():
    df = dataset.get_df()
    lo, hi = dataset.year_range()
    model = active_model_summary() or {}
    return {
        "record_count": int(len(df)),
        "crop_count": int(df["crop_type"].nunique()),
        "region_count": int(df["region"].nunique()),
        "year_min": lo,
        "year_max": hi,
        "model_name": model.get("name"),
        "r2": model.get("r2"),
        "rmse": model.get("rmse"),
        "mae": model.get("mae"),
    }
