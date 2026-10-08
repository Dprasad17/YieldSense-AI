"""Yield-history inputs for the model (since v3.0): what the country harvested in earlier seasons.

- yield_lag1:  the most recent earlier season's national yield for the crop (kg/ha)
- yield_mean3: the mean of up to the last three earlier seasons

Both use only seasons before the one being predicted, so they are known at forecast time. Training
computes them per country × crop with a shift; serving looks them up in the crop records, or takes the
farm's own values when the caller supplies them. Missing history (a new crop for a country) stays NaN,
which XGBoost handles natively.
"""
from bisect import bisect_left
from functools import lru_cache
from typing import Optional

import numpy as np
import pandas as pd

LAG_FEATURES = ["yield_lag1", "yield_mean3"]


def add_lag_features(df: pd.DataFrame) -> pd.DataFrame:
    """Training: one yield per country × crop × year (mean over duplicate rows), shifted within the series."""
    yearly = df.groupby(["region", "crop_type", "year"], as_index=False)["yield_kg_per_hectare"].mean().sort_values(["region", "crop_type", "year"])
    g = yearly.groupby(["region", "crop_type"])["yield_kg_per_hectare"]
    yearly["yield_lag1"] = g.shift(1)
    yearly["yield_mean3"] = g.transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    out = df.drop(columns=[c for c in LAG_FEATURES if c in df.columns]).merge(
        yearly[["region", "crop_type", "year", *LAG_FEATURES]], on=["region", "crop_type", "year"], how="left"
    )
    out.index = df.index
    return out


@lru_cache(maxsize=1)
def _series() -> dict[tuple[str, str], tuple[list[int], list[float]]]:
    from backend.app.services.dataset import get_df

    df = get_df()
    yearly = df.groupby(["region", "crop_type", "year"])["yield_kg_per_hectare"].mean()
    out: dict[tuple[str, str], tuple[list[int], list[float]]] = {}
    for (region, crop, year), value in yearly.items():
        years, values = out.setdefault((str(region), str(crop)), ([], []))
        years.append(int(year))
        values.append(float(value))
    return out


def invalidate() -> None:
    _series.cache_clear()


def lookup(region: str, crop: str, year: int) -> tuple[Optional[float], Optional[float]]:
    """(yield_lag1, yield_mean3) from the crop records for seasons strictly before `year`."""
    years, values = _series().get((str(region), str(crop)), ([], []))
    i = bisect_left(years, int(year))
    if i == 0:
        return None, None
    prior = values[max(0, i - 3) : i]
    return values[i - 1], float(np.mean(prior))


def fill(frame: pd.DataFrame) -> pd.DataFrame:
    """Serving: adds the lag columns where they are absent or empty."""
    frame = frame.copy()
    for col in LAG_FEATURES:
        if col not in frame.columns:
            frame[col] = np.nan
    need = frame[LAG_FEATURES].isna().any(axis=1)
    for idx in frame.index[need]:
        row = frame.loc[idx]
        lag1, mean3 = lookup(row["region"], row["crop_type"], int(row["year"]))
        if pd.isna(row["yield_lag1"]):
            frame.at[idx, "yield_lag1"] = lag1 if lag1 is not None else np.nan
        if pd.isna(row["yield_mean3"]):
            frame.at[idx, "yield_mean3"] = mean3 if mean3 is not None else np.nan
    frame[LAG_FEATURES] = frame[LAG_FEATURES].astype(float)
    return frame
