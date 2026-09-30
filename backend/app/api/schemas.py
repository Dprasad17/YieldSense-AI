"""Shared response models."""
from typing import Generic, Optional, TypeVar

from fastapi import Query
from pydantic import BaseModel

from backend.app.services.dataset import Filters, canonical

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    """One pagination envelope for every list endpoint."""

    items: list[T]
    total: int
    page: int
    page_size: int


def paginate(items: list, page: int, page_size: int) -> dict:
    start = (page - 1) * page_size
    return {"items": items[start : start + page_size], "total": len(items), "page": page, "page_size": page_size}


def context_filters(
    region: Optional[str] = Query(None, description="Dataset region (country)"),
    crop: Optional[str] = Query(None, description="Crop type"),
    year_from: Optional[int] = Query(None, ge=1900, le=2100),
    year_to: Optional[int] = Query(None, ge=1900, le=2100),
) -> Filters:
    """Region · Crop · Year filters, normalised to the dataset's spelling.
    Unknown values are kept as-is so they match nothing (empty result) rather than silently widening."""
    return Filters.of(
        canonical(region, "region") or region,
        canonical(crop, "crop_type") or crop,
        year_from,
        year_to,
    )


class ActiveModel(BaseModel):
    name: str
    version: Optional[str] = None
    target: Optional[str] = None
    split: Optional[str] = None
    r2: float
    rmse: float
    mae: float
    mape: Optional[float] = None
    interval_coverage: Optional[float] = None
    inference_latency_ms: Optional[float] = None
    test_size: Optional[int] = None
