"""
Crop-specific agronomy reference, derived from the dataset. The single source of truth for
optimal ranges, risk thresholds and productivity bands used by recommendations, risk,
farm comparison, soil guidance and prediction ratings.

How each value is derived (per crop, computed once from datasets/processed/cleaned_crop_yield.csv):

- OPTIMAL RANGE of a feature = P25–P75 of that feature among the crop's top-quartile-yield
  records (yield >= the crop's P75). "Where the best-yielding records sit."
- DROUGHT threshold = P10 of rainfall across all of the crop's records.
- FLOOD threshold   = P90 of rainfall across all of the crop's records.
- HEAT threshold    = P90 of temperature across all of the crop's records.
- DISEASE: status "Moderate" or "Severe" counts as a pest/disease event.
- PRODUCTIVITY bands: Low < P33 of the crop's yield ≤ Medium ≤ P67 < High.

Scoring scales (likelihood and impact on 1–5) are fixed, documented constants below.

Data caveat: in this dataset NDVI tracks yield closely (r≈0.82), temperature and pH weakly
(r≈−0.1), and rainfall, soil moisture, sunlight and disease status show no measurable
relationship with yield. Rules still flag out-of-range values, but impacts are measured,
not assumed, so they can legitimately come out near zero.
"""
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import pandas as pd

from backend.app.services.dataset import get_df

# feature column -> (label, unit)
FEATURES: dict[str, tuple[str, str]] = {
    "soil_pH": ("Soil pH", "pH"),
    "soil_moisture_%": ("Soil moisture", "%"),
    "NDVI_index": ("NDVI", "index"),
    "rainfall_mm": ("Seasonal rainfall", "mm"),
    "temperature_C": ("Temperature", "°C"),
    "humidity_%": ("Humidity", "%"),
    "sunlight_hours": ("Sunlight", "h/day"),
}

DISEASE_EVENT_STATUSES = ("Moderate", "Severe")

# Likelihood: share of records breaching a threshold -> 1..5
LIKELIHOOD_BANDS = [(0.05, 1), (0.15, 2), (0.30, 3), (0.50, 4)]  # above last -> 5
# Impact: relative median-yield loss of breaching vs non-breaching records -> 1..5
IMPACT_BANDS = [(0.05, 1), (0.10, 2), (0.20, 3), (0.35, 4)]  # above last -> 5
# Risk level from likelihood × impact (1..25)
RISK_LEVELS = [(4, "Low"), (9, "Moderate"), (15, "High")]  # above last -> "Critical"


@dataclass(frozen=True)
class Range:
    low: float
    high: float

    def contains(self, value: float) -> bool:
        return self.low <= value <= self.high

    @property
    def mid(self) -> float:
        return (self.low + self.high) / 2


@dataclass(frozen=True)
class CropRules:
    crop: str
    record_count: int
    optimal: dict[str, Range]
    drought_rainfall_mm: float
    flood_rainfall_mm: float
    heat_temperature_c: float
    productivity_low_below: float
    productivity_high_above: float


def _q(series: pd.Series, q: float) -> float:
    return round(float(series.quantile(q)), 2)


@lru_cache(maxsize=None)
def rules_for(crop: str) -> Optional[CropRules]:
    df = get_df()
    c = df[df["crop_type"].str.lower() == crop.lower()]
    if c.empty:
        return None
    top = c[c["yield_kg_per_hectare"] >= c["yield_kg_per_hectare"].quantile(0.75)]
    return CropRules(
        crop=str(c["crop_type"].iloc[0]),
        record_count=len(c),
        optimal={f: Range(_q(top[f], 0.25), _q(top[f], 0.75)) for f in FEATURES},
        drought_rainfall_mm=_q(c["rainfall_mm"], 0.10),
        flood_rainfall_mm=_q(c["rainfall_mm"], 0.90),
        heat_temperature_c=_q(c["temperature_C"], 0.90),
        productivity_low_below=_q(c["yield_kg_per_hectare"], 0.33),
        productivity_high_above=_q(c["yield_kg_per_hectare"], 0.67),
    )


def productivity_rating(crop: str, predicted_kg_ha: float) -> str:
    r = rules_for(crop)
    if not r:
        return "Medium"
    if predicted_kg_ha < r.productivity_low_below:
        return "Low"
    if predicted_kg_ha > r.productivity_high_above:
        return "High"
    return "Medium"


def input_risk_flags(crop: str, values: dict) -> list[str]:
    """Which risk conditions a single set of inputs triggers (used for per-prediction risk)."""
    r = rules_for(crop)
    if not r:
        return []
    flags = []
    rain = values.get("rainfall_mm")
    if rain is not None and rain < r.drought_rainfall_mm:
        flags.append("drought")
    if rain is not None and rain > r.flood_rainfall_mm:
        flags.append("flood")
    temp = values.get("temperature_C")
    if temp is not None and temp > r.heat_temperature_c:
        flags.append("heat")
    ph = values.get("soil_pH")
    if ph is not None and not r.optimal["soil_pH"].contains(ph):
        flags.append("soil")
    if str(values.get("crop_disease_status", "None")) in DISEASE_EVENT_STATUSES:
        flags.append("pest_disease")
    return flags


def risk_rating_from_flags(flags: list[str]) -> str:
    n = len(flags)
    return "High" if n >= 3 else "Medium" if n >= 1 else "Low"


def band(value: float, bands: list[tuple[float, int]], top: int = 5) -> int:
    for limit, score in bands:
        if value < limit:
            return score
    return top


def risk_level(score: int) -> str:
    for limit, level in RISK_LEVELS:
        if score <= limit:
            return level
    return "Critical"


def soil_health_index(crop: str, ph: float, moisture: float) -> float:
    """0–1: how well pH and moisture sit in the crop's optimal ranges (NDVI is excluded: it is derived from yield),
    with partial credit that decays with distance outside the range."""
    r = rules_for(crop)
    if not r:
        return 0.0

    def score(feature: str, value: float) -> float:
        rng = r.optimal[feature]
        if rng.contains(value):
            return 1.0
        width = max(rng.high - rng.low, 1e-6)
        dist = (rng.low - value) if value < rng.low else (value - rng.high)
        return max(0.0, 1.0 - dist / width)

    return round((score("soil_pH", ph) + score("soil_moisture_%", moisture)) / 2, 3)
