"""
The crop-yield dataset, loaded once and shared by every endpoint.

Each row is one record (farm_id is unique per row): a region (country) × crop × year observation
with agronomic features. Aggregates are cached per filter combination.
"""
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import numpy as np
import pandas as pd



NUMERIC_FEATURES = [
    "yield_kg_per_hectare",
    "rainfall_mm",
    "temperature_C",
    "pesticide_usage_ml",
    "soil_pH",
    "soil_moisture_%",
    "humidity_%",
    "sunlight_hours",
    "total_days",
    "NDVI_index",
]


# Postgres column -> analysis column (the names the rest of the app and the model use)
_COLUMN_MAP = {
    "record_code": "farm_id",
    "temperature_c": "temperature_C",
    "soil_ph": "soil_pH",
    "soil_moisture_percent": "soil_moisture_%",
    "humidity_percent": "humidity_%",
    "ndvi_index": "NDVI_index",
}


@lru_cache(maxsize=1)
def get_df() -> pd.DataFrame:
    """All crop records (reference dataset + imported rows) from PostgreSQL, cached until invalidated."""
    from backend.app.db.session import engine

    df = pd.read_sql(
        "SELECT record_code, region, crop_type, year, yield_kg_per_hectare, rainfall_mm, temperature_c, pesticide_usage_ml, "
        "soil_ph, soil_moisture_percent, humidity_percent, sunlight_hours, total_days, sowing_date, harvest_date, "
        "irrigation_type, fertilizer_type, crop_disease_status, ndvi_index, source FROM crop_records ORDER BY id",
        engine,
    ).rename(columns=_COLUMN_MAP)
    if df.empty:
        raise FileNotFoundError("No crop records in the database. Run: python scripts/seed.py")
    df["sowing_date"] = pd.to_datetime(df["sowing_date"], errors="coerce")
    df["harvest_date"] = pd.to_datetime(df["harvest_date"], errors="coerce")
    df["year"] = df["year"].astype("Int64")
    # An empty disease status means no disease was recorded.
    df["crop_disease_status"] = df["crop_disease_status"].fillna("None").astype(str)
    for col in ("region", "crop_type", "irrigation_type", "fertilizer_type"):
        df[col] = df[col].fillna("").astype(str).str.strip()
    return df


def invalidate() -> None:
    """Drop every cached aggregate after records change (imports)."""
    get_df.cache_clear()
    region_ranking.cache_clear()
    from backend.app.services import history_features

    history_features.invalidate()
    yearly_yield.cache_clear()
    from backend.app.core import agronomy_rules
    from backend.app.services import insights

    agronomy_rules.rules_for.cache_clear()
    for fn in (insights.seasonal_trends, insights.farm_comparison, insights.risk_assessment, insights.recommendations, insights.soil_assessment):
        fn.cache_clear()


@dataclass(frozen=True)
class Filters:
    """Hashable filter set so aggregates can be cached per combination."""

    region: Optional[str] = None
    crop: Optional[str] = None
    year_from: Optional[int] = None
    year_to: Optional[int] = None

    @staticmethod
    def of(region=None, crop=None, year_from=None, year_to=None) -> "Filters":
        clean = lambda v: v.strip() if isinstance(v, str) and v.strip() else None  # noqa: E731
        return Filters(clean(region), clean(crop), year_from, year_to)

    def describe(self) -> str:
        parts = [self.region or "All regions", self.crop or "All crops"]
        if self.year_from or self.year_to:
            parts.append(f"{self.year_from or '…'}–{self.year_to or '…'}")
        return " · ".join(parts)

    def slug(self) -> str:
        parts = [p for p in (self.region, self.crop) if p]
        if self.year_from or self.year_to:
            parts.append(f"{self.year_from or 'start'}-{self.year_to or 'end'}")
        return "_".join(p.lower().replace(" ", "-") for p in parts) or "all"


def filter_df(f: Filters) -> pd.DataFrame:
    df = get_df()
    mask = pd.Series(True, index=df.index)
    if f.region:
        mask &= df["region"].str.lower() == f.region.lower()
    if f.crop:
        mask &= df["crop_type"].str.lower() == f.crop.lower()
    if f.year_from is not None:
        mask &= df["year"] >= f.year_from
    if f.year_to is not None:
        mask &= df["year"] <= f.year_to
    return df[mask]


def canonical(value: Optional[str], column: str) -> Optional[str]:
    """Maps a case-insensitive value to the dataset's spelling, or None if unknown."""
    if not value:
        return None
    lookup = {v.lower(): v for v in get_df()[column].unique()}
    return lookup.get(value.strip().lower())


def crops() -> list[str]:
    return sorted(get_df()["crop_type"].unique().tolist())


def regions() -> list[str]:
    return sorted(get_df()["region"].unique().tolist())


def year_range() -> tuple[int, int]:
    years = get_df()["year"].dropna()
    return int(years.min()), int(years.max())


def missing_years() -> list[int]:
    lo, hi = year_range()
    present = set(int(y) for y in get_df()["year"].dropna().unique())
    return [y for y in range(lo, hi + 1) if y not in present]


def safe_float(v) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(f) or np.isinf(f) else f


@lru_cache(maxsize=512)
def region_ranking(crop: Optional[str]) -> list[dict]:
    df = filter_df(Filters.of(crop=crop))
    g = df.groupby("region")["yield_kg_per_hectare"]
    out = pd.DataFrame({"mean": g.mean(), "median": g.median(), "count": g.size()}).reset_index()
    out = out.sort_values(["mean", "region"], ascending=[False, True])
    return [
        {
            "region": r.region,
            "mean_yield_kg_ha": round(float(r["mean"]), 2),
            "median_yield_kg_ha": round(float(r["median"]), 2),
            "record_count": int(r["count"]),
        }
        for _, r in out.iterrows()
    ]


@lru_cache(maxsize=512)
def yearly_yield(f: Filters) -> list[dict]:
    df = filter_df(f)
    g = df.groupby("year")["yield_kg_per_hectare"]
    out = pd.DataFrame({"mean": g.mean(), "median": g.median(), "count": g.size()}).reset_index()
    return [
        {
            "year": int(r.year),
            "mean_yield_kg_ha": round(float(r["mean"]), 2),
            "median_yield_kg_ha": round(float(r["median"]), 2),
            "record_count": int(r["count"]),
        }
        for _, r in out.sort_values("year").iterrows()
    ]
