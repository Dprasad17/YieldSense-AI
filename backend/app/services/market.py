"""Expected revenue per crop: the model's yield × FAOSTAT producer price.

Prices are FAOSTAT Producer Prices (USD/tonne, annual), the latest year since 2015 for each country and
crop (datasets/processed/producer_prices.json, built by scripts/build_dataset_v3.py). Where a country has
no recent price, the median across countries is used and labelled. This is gross revenue: input costs
are not in the data, so it is not profit.
"""
import json
import os
from functools import lru_cache
from typing import Optional

import pandas as pd

from backend.app.services import dataset
from backend.app.services.ml_service import ml_service

PRICES_PATH = os.path.join("datasets", "processed", "producer_prices.json")


@lru_cache(maxsize=1)
def prices() -> dict:
    try:
        with open(PRICES_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"prices": {}, "crop_median": {}, "source": "unavailable"}


def price_for(region: str, crop: str) -> Optional[dict]:
    p = prices()
    own = (p.get("prices", {}).get(region) or {}).get(crop)
    if own:
        return {**own, "basis": f"{region} producer price ({own['year']})"}
    median = p.get("crop_median", {}).get(crop)
    if median is not None:
        return {"usd_per_tonne": median, "year": None, "basis": "median producer price across countries (no recent price for this country)"}
    return None


def crop_economics(region: str, area_ha: Optional[float] = None, crops: Optional[list[str]] = None) -> dict:
    """For each crop grown in the region: predicted yield for next season (the region's latest inputs),
    the producer price and the expected gross revenue per hectare (and for the farm area if given)."""
    df = dataset.get_df()
    rows = df[df["region"] == region]
    if rows.empty:
        raise ValueError(f"No records for region '{region}'.")
    last_year = int(rows["year"].max())
    latest = rows[rows["year"] == last_year].groupby("crop_type").agg(
        rainfall_mm=("rainfall_mm", "mean"), temperature_C=("temperature_C", "mean"), pesticide_usage_ml=("pesticide_usage_ml", "mean")
    )
    wanted = [c for c in (crops or latest.index.tolist()) if c in latest.index]
    if not wanted:
        raise ValueError("None of these crops have records in this region.")
    frame = pd.DataFrame(
        [{"crop_type": c, "region": region, "year": last_year + 1, **latest.loc[c].to_dict()} for c in wanted]
    )
    yields = ml_service.predict_frame(frame)
    lows, highs = ml_service.interval(yields)
    items = []
    for i, crop in enumerate(wanted):
        price = price_for(region, crop)
        y, lo, hi = float(yields[i]), float(lows[i]), float(highs[i])
        per_ha = y / 1000 * price["usd_per_tonne"] if price else None
        items.append(
            {
                "crop": crop,
                "predicted_yield_kg_ha": round(y, 1),
                "low_kg_ha": round(min(lo, y), 1),
                "high_kg_ha": round(max(hi, y), 1),
                "price_usd_per_tonne": price["usd_per_tonne"] if price else None,
                "price_basis": price["basis"] if price else "no price available",
                "revenue_usd_per_ha": round(per_ha, 0) if per_ha is not None else None,
                "revenue_low_usd_per_ha": round(min(lo, y) / 1000 * price["usd_per_tonne"], 0) if price else None,
                "revenue_high_usd_per_ha": round(max(hi, y) / 1000 * price["usd_per_tonne"], 0) if price else None,
                "revenue_usd_farm": round(per_ha * area_ha, 0) if per_ha is not None and area_ha else None,
            }
        )
    items.sort(key=lambda r: -(r["revenue_usd_per_ha"] or 0))
    return {
        "region": region,
        "season": last_year + 1,
        "basis_year": last_year,
        "area_ha": area_ha,
        "items": items,
        "price_source": prices().get("source"),
        "note": "Gross revenue = predicted yield × producer price. Seed, fertilizer, labour and water costs are not in the data, "
        "so this is not profit. Prices are national farm-gate averages in US dollars.",
    }
