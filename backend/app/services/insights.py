"""
Derived analytics over the dataset: forecast band, farm comparison, risk, rule-based
recommendations and soil assessment. All thresholds come from core/agronomy_rules.
"""
from datetime import date, timedelta
from functools import lru_cache
from typing import Optional

import numpy as np
import pandas as pd

from backend.app.core import agronomy_rules as ar
from backend.app.services.dataset import Filters, filter_df, get_df, yearly_yield
from backend.app.services.ml_service import ml_service

SAMPLE_SIZE = 600  # records sampled for model-based estimates (fixed seed, so results are stable)
SEED = 42


def _sample(df: pd.DataFrame, n: int = SAMPLE_SIZE) -> pd.DataFrame:
    return df if len(df) <= n else df.sample(n, random_state=SEED)


def _rules_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Per-row thresholds for the row's crop, so mixed-crop contexts are judged crop by crop."""
    rows = []
    for crop in df["crop_type"].unique():
        r = ar.rules_for(crop)
        if not r:
            continue
        rows.append(
            {
                "crop_type": crop,
                "drought": r.drought_rainfall_mm,
                "flood": r.flood_rainfall_mm,
                "heat": r.heat_temperature_c,
                "ph_low": r.optimal["soil_pH"].low,
                "ph_high": r.optimal["soil_pH"].high,
            }
        )
    return df[["crop_type"]].merge(pd.DataFrame(rows), on="crop_type", how="left").set_index(df.index)


# ------------------------------------------------------------------ forecast


@lru_cache(maxsize=256)
def seasonal_trends(f: Filters) -> dict:
    series = yearly_yield(f)
    df = filter_df(f)
    forecast = None
    if series:
        last_year = series[-1]["year"]
        basis = _sample(df[df["year"] == last_year], 2000).copy()
        basis["year"] = last_year + 1
        preds = ml_service.predict_frame(basis)
        lows, highs = ml_service.interval(preds)
        forecast = {
            "year": last_year + 1,
            "mean_kg_ha": round(float(preds.mean()), 2),
            "p10_kg_ha": round(float(np.mean(lows)), 2),
            "p90_kg_ha": round(float(np.mean(highs)), 2),
            "basis_year": last_year,
            "basis_records": int(len(basis)),
            "method": (
                f"Mean {ml_service.name} prediction for {last_year + 1} over {len(basis):,} records, using their "
                f"{last_year} rainfall, temperature and pesticide values. Band: mean of each record's P10–P90 interval "
                "(split-conformal residuals from the 2009–2013 out-of-time test). Tree models do not extrapolate trends "
                "past the last training year."
            ),
        }
    years = [p["year"] for p in series]
    missing = [y for y in range(min(years), max(years) + 1) if y not in years] if years else []
    return {
        "granularity": "year",
        "scope": f.describe(),
        "series": series,
        "missing_years": missing,
        "forecast": forecast,
    }


# ------------------------------------------------------------------ farm comparison


def _row_risk(row: pd.Series) -> tuple[str, list[str]]:
    flags = ar.input_risk_flags(row["crop_type"], row.to_dict())
    return ar.risk_rating_from_flags(flags), flags


@lru_cache(maxsize=256)
def farm_comparison(f: Filters, limit: int, sort: str) -> dict:
    df = filter_df(f)
    ascending = sort == "yield_asc"
    picked = df.sort_values(["yield_kg_per_hectare", "farm_id"], ascending=[ascending, True]).head(limit)
    farms = []
    for _, row in picked.iterrows():
        rating, flags = _row_risk(row)
        farms.append(
            {
                "farm_id": row["farm_id"],
                "region": row["region"],
                "crop_type": row["crop_type"],
                "year": int(row["year"]),
                "yield_kg_ha": round(float(row["yield_kg_per_hectare"]), 2),
                "soil_health_index": ar.soil_health_index(row["crop_type"], float(row["soil_pH"]), float(row["soil_moisture_%"])),
                "soil_pH": float(row["soil_pH"]),
                "soil_moisture_percent": float(row["soil_moisture_%"]),
                "ndvi": float(row["NDVI_index"]),
                "risk_rating": rating,
                "risk_flags": flags,
            }
        )
    return {
        "scope": f.describe(),
        "total_records": int(len(df)),
        "mean_yield_kg_ha": round(float(df["yield_kg_per_hectare"].mean()), 2) if len(df) else None,
        "sort": sort,
        "farms": farms,
        "risk_method": "Flags per record from agronomy rules (drought, flood, heat, soil pH, disease); 0 = Low, 1–2 = Medium, 3+ = High.",
    }


# ------------------------------------------------------------------ risk

# Rainfall in the dataset is one long-term average per country (constant across years), so drought and
# flood describe a country's climate zone (structural risk), not a particular year's weather.
STRUCTURAL_RISKS = {"drought", "flood"}
STRUCTURAL_NOTE = "Climate-zone (structural) risk: rainfall is a long-term country average, constant across years, so this doesn't change from year to year."
# Model features whose kg/ha effect we don't report: rainfall is a cross-country association, not a yearly weather effect.
NOT_ESTIMATED_FEATURES = {"rainfall_mm": "Not estimated: rainfall is a long-term country average (constant across years), so the model's rainfall effect is a cross-country association, not a yearly weather effect."}

RISK_TYPES = {
    "drought": ("Drought (climate zone)", "Long-term rainfall below the crop's P10", "irrigation"),
    "flood": ("Flood / waterlogging (climate zone)", "Long-term rainfall above the crop's P90", "irrigation"),
    "heat": ("Heat stress", "Temperature above the crop's P90", "crop_planning"),
    "pest_disease": ("Pest & disease", "Moderate or severe disease recorded", "disease_pest"),
    "soil": ("Soil pH", "pH outside the crop's optimal band", "fertilizer"),
}

MITIGATION = {
    "drought": "Prioritise irrigation scheduling and moisture-conserving practices (mulch, reduced tillage).",
    "flood": "Improve drainage and avoid sowing low-lying plots during the wettest weeks.",
    "heat": "Shift sowing to avoid the hottest window and consider heat-tolerant varieties.",
    "pest_disease": "Increase scouting frequency and act at the first confirmed symptoms.",
    "soil": "Correct pH with lime (acidic) or sulfur/gypsum (alkaline) after a soil test.",
}


def _breach_masks(df: pd.DataFrame) -> dict[str, pd.Series]:
    t = _rules_frame(df)
    return {
        "drought": df["rainfall_mm"] < t["drought"],
        "flood": df["rainfall_mm"] > t["flood"],
        "heat": df["temperature_C"] > t["heat"],
        "pest_disease": df["crop_disease_status"].isin(ar.DISEASE_EVENT_STATUSES),
        "soil": (df["soil_pH"] < t["ph_low"]) | (df["soil_pH"] > t["ph_high"]),
    }


def _relative_loss(df: pd.DataFrame, mask: pd.Series) -> float:
    """Median-yield loss of breaching vs non-breaching records, compared within each crop and
    weighted by breaching count. Negative losses (breach does better) count as 0."""
    total, weight = 0.0, 0
    for _, g in df.groupby("crop_type"):
        m = mask.loc[g.index]
        hit, ok = g[m], g[~m]
        if len(hit) == 0 or len(ok) == 0:
            continue
        base = float(ok["yield_kg_per_hectare"].median())
        if base <= 0:
            continue
        loss = max(0.0, (base - float(hit["yield_kg_per_hectare"].median())) / base)
        total += loss * len(hit)
        weight += len(hit)
    return total / weight if weight else 0.0


@lru_cache(maxsize=256)
def risk_assessment(f: Filters) -> dict:
    df = filter_df(f)
    items, timeline = [], []
    if len(df):
        masks = _breach_masks(df)
        for key, mask in masks.items():
            label, trigger, category = RISK_TYPES[key]
            share = float(mask.mean())
            loss = _relative_loss(df, mask)
            likelihood = ar.band(share, ar.LIKELIHOOD_BANDS)
            impact = ar.band(loss, ar.IMPACT_BANDS)
            items.append(
                {
                    "type": key,
                    "label": label,
                    "trigger": trigger,
                    "share_affected": round(share, 4),
                    "median_yield_loss_pct": round(loss * 100, 1),
                    "likelihood": likelihood,
                    "impact": impact,
                    "score": likelihood * impact,
                    "level": ar.risk_level(likelihood * impact),
                    "mitigation": MITIGATION[key],
                    "recommendation_category": category,
                    "structural": key in STRUCTURAL_RISKS,
                    "note": STRUCTURAL_NOTE if key in STRUCTURAL_RISKS else None,
                }
            )
        yearly = {k: v for k, v in masks.items() if k not in STRUCTURAL_RISKS}
        by_year = pd.DataFrame({k: v.astype(float) for k, v in yearly.items()}).assign(year=df["year"]).groupby("year").mean()
        timeline = [
            {"year": int(y), **{k: round(float(row[k]), 4) for k in yearly}} for y, row in by_year.sort_index().iterrows()
        ]
    items.sort(key=lambda r: (-r["score"], r["type"]))
    return {
        "scope": f.describe(),
        "record_count": int(len(df)),
        "risks": items,
        "timeline": timeline,
        "anomalies": anomalies(f),
        "method": (
            "Likelihood = share of records breaching the crop threshold (1–5). Impact = median yield loss of "
            "breaching vs other records of the same crop (1–5). Level from likelihood × impact. Drought and flood use "
            "long-term rainfall (constant per country), so they are climate-zone risks and are left out of the yearly timeline."
        ),
    }


def anomalies(f: Filters, limit: int = 50) -> list[dict]:
    """Records whose yield is more than 3σ from their crop's mean (computed over the whole dataset)."""
    df = filter_df(f)
    if df.empty:
        return []
    stats = get_df().groupby("crop_type")["yield_kg_per_hectare"].agg(["mean", "std"])
    joined = df.join(stats, on="crop_type")
    z = (joined["yield_kg_per_hectare"] - joined["mean"]) / joined["std"].replace(0, np.nan)
    out = joined.assign(z=z)[z.abs() > 3].sort_values("z", key=lambda s: s.abs(), ascending=False).head(limit)
    return [
        {
            "farm_id": r.farm_id,
            "region": r.region,
            "crop_type": r.crop_type,
            "year": int(r.year),
            "yield_kg_ha": round(float(r.yield_kg_per_hectare), 2),
            "crop_mean_kg_ha": round(float(r["mean"]), 2),
            "z_score": round(float(r.z), 2),
            "direction": "high" if r.z > 0 else "low",
        }
        for _, r in out.iterrows()
    ]


# ------------------------------------------------------------------ recommendations

SEVERITY_DEADLINE_DAYS = {"critical": 2, "high": 7, "medium": 14, "info": 30}
SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "info": 3}


def _slug(value: Optional[str]) -> str:
    return (value or "all").lower().replace(" ", "-")


def recommendation_id(rule: str, f: Filters) -> str:
    return f"{rule}__{_slug(f.region)}__{_slug(f.crop)}"


def parse_recommendation_id(rec_id: str) -> Optional[Filters]:
    """Resolves the region/crop slugs in an id back to dataset names. None if unknown."""
    parts = rec_id.split("__")
    if len(parts) != 3:
        return None
    _, region_slug, crop_slug = parts
    df = get_df()

    def resolve(slug: str, column: str) -> tuple[bool, Optional[str]]:
        if slug == "all":
            return True, None
        match = next((v for v in df[column].unique() if _slug(v) == slug), None)
        return match is not None, match

    ok_r, region = resolve(region_slug, "region")
    ok_c, crop = resolve(crop_slug, "crop_type")
    return Filters.of(region, crop) if ok_r and ok_c else None


def _impact(df: pd.DataFrame, mask: pd.Series, adjust, feature: str) -> Optional[float]:
    """Model-estimated mean gain (kg/ha) on affected records when `adjust` fixes the feature.
    None when the feature is not a model input (synthetic columns): the model can't estimate it."""
    if feature not in ml_service.features or feature in NOT_ESTIMATED_FEATURES:
        return None
    affected = df[mask]
    if affected.empty:
        return 0.0
    sample = _sample(affected)
    fixed = adjust(sample.copy())
    delta = ml_service.predict_frame(fixed) - ml_service.predict_frame(sample)
    return float(np.mean(delta))


def _severity(impact: Optional[float], baseline: float, share: float) -> str:
    if impact is None:
        # Not modelled: severity from how many records are affected.
        return "high" if share >= 0.5 else "medium" if share >= 0.2 else "info"
    rel = impact / baseline if baseline > 0 else 0.0
    if impact <= 0 or rel < 0.01:
        return "info"
    if rel >= 0.10 and share >= 0.30:
        return "critical"
    if rel >= 0.05:
        return "high"
    return "medium"


def _clip_to_optimal(feature: str):
    def adjust(frame: pd.DataFrame) -> pd.DataFrame:
        for crop, idx in frame.groupby("crop_type").groups.items():
            r = ar.rules_for(str(crop))
            if r:
                rng = r.optimal[feature]
                frame.loc[idx, feature] = frame.loc[idx, feature].clip(rng.low, rng.high)
        return frame

    return adjust


def _crop_ranges(df: pd.DataFrame, feature: str) -> tuple[pd.Series, pd.Series]:
    bounds = {}
    for c in df["crop_type"].unique():
        r = ar.rules_for(c)
        bounds[c] = (r.optimal[feature].low, r.optimal[feature].high) if r else (np.nan, np.nan)
    return df["crop_type"].map(lambda c: bounds[c][0]), df["crop_type"].map(lambda c: bounds[c][1])


# rule key -> (feature, direction, category, title, action_label, action)
FEATURE_RULES = [
    ("moisture_deficit", "soil_moisture_%", "low", "irrigation", "Soil moisture below the optimal band",
     "Create irrigation task", "Schedule irrigation to bring root-zone moisture into the optimal band."),
    ("heat_stress", "temperature_C", "high", "crop_planning", "Temperatures above the optimal band",
     "Create planning task", "Shift sowing to a cooler window or trial heat-tolerant varieties."),
    ("ph_low", "soil_pH", "low", "fertilizer", "Soil too acidic for this crop",
     "Create liming task", "Soil-test, then apply agricultural lime to raise pH into the optimal band."),
    ("ph_high", "soil_pH", "high", "fertilizer", "Soil too alkaline for this crop",
     "Create amendment task", "Soil-test, then apply elemental sulfur or gypsum to lower pH."),
    ("rainfall_deficit", "rainfall_mm", "low", "irrigation", "Seasonal rainfall below the optimal band",
     "Create irrigation task", "Plan supplemental irrigation for the driest weeks of the season."),
]


@lru_cache(maxsize=256)
def recommendations(f: Filters) -> dict:
    from backend.app.services.llm_service import llm_service

    df = filter_df(f)
    recs: list[dict] = []
    if df.empty:
        return {"scope": f.describe(), "record_count": 0, "recommendations": [], "context": None, "crop_cycle": None}

    baseline = float(df["yield_kg_per_hectare"].median())
    crop_label = f.crop or "crop"
    area = f"{f.region or 'All regions'} · {f.crop or 'All crops'} · {len(df):,} records"

    for rule, feature, direction, category, title, action_label, action in FEATURE_RULES:
        lows, highs = _crop_ranges(df, feature)
        mask = (df[feature] < lows) if direction == "low" else (df[feature] > highs)
        observed = float(df[feature].median())
        median_low, median_high = float(lows.median()), float(highs.median())
        trigger = observed < median_low if direction == "low" else observed > median_high
        if not trigger:
            continue
        label, unit = ar.FEATURES[feature]
        impact = _impact(df, mask, _clip_to_optimal(feature), feature)
        share = float(mask.mean())
        recs.append(
            _rec(rule, f, category, title, action_label, action, impact, baseline, share, area, crop_label,
                 [_evidence(label, unit, observed, median_low, median_high, share)], feature)
        )

    disease_mask = df["crop_disease_status"].isin(ar.DISEASE_EVENT_STATUSES)
    disease_share = float(disease_mask.mean())
    if disease_share >= 0.10:
        def cure(frame: pd.DataFrame) -> pd.DataFrame:
            frame["crop_disease_status"] = "None"
            return frame

        impact = _impact(df, disease_mask, cure, "crop_disease_status")
        recs.append(
            _rec("disease_pressure", f, "disease_pest", "Moderate or severe disease in many records",
                 "Create scouting task", "Increase scouting and treat confirmed outbreaks early.",
                 impact, baseline, disease_share, area, crop_label,
                 [_evidence("Moderate/severe disease", "%", round(disease_share * 100, 1), 0, 10, disease_share)])
        )

    for rec in recs:
        rec["rationale"], rec["rationale_source"] = llm_service.write_rationale(rec)
        del rec["crop_label"]

    recs.sort(key=lambda r: (SEVERITY_ORDER[r["severity"]], -(r["impact_kg_ha"] or 0.0)))
    return {
        "scope": f.describe(),
        "record_count": int(len(df)),
        "recommendations": recs,
        "context": _context_climate(df),
        "crop_cycle": crop_cycle(f.crop) if f.crop else None,
    }


def _evidence(label, unit, observed, low, high, share) -> dict:
    return {
        "label": label,
        "unit": "" if unit in ("pH", "index") else (unit if unit in ("%",) else f" {unit}"),
        "observed": round(float(observed), 2),
        "optimal_low": round(float(low), 2),
        "optimal_high": round(float(high), 2),
        "share_affected": round(float(share), 4),
    }


def _rec(rule, f, category, title, action_label, action, impact, baseline, share, area, crop_label, evidence, feature=None) -> dict:
    severity = _severity(impact, baseline, share)
    days = SEVERITY_DEADLINE_DAYS[severity]
    return {
        "id": recommendation_id(rule, f),
        "rule": rule,
        "severity": severity,
        "category": category,
        "title": title,
        "action": action,
        "action_label": action_label,
        "impact_kg_ha": None if impact is None else round(float(impact), 1),
        "impact_basis": (
            NOT_ESTIMATED_FEATURES.get(feature or "", "Not estimated: this column is synthetic in the dataset and is not a model input.")
            + " Severity reflects the share of records outside the optimal band."
            if impact is None
            else f"{ml_service.name} estimate: mean change in predicted yield on affected records when the value is moved into the optimal band."
        ),
        "deadline_days": days,
        "deadline": (date.today() + timedelta(days=days)).isoformat(),
        "affected_area": area,
        "evidence": evidence,
        "crop_label": crop_label,
    }


def _context_climate(df: pd.DataFrame) -> dict:
    return {
        "source": "YieldSense dataset (medians)",
        "temperature_C": round(float(df["temperature_C"].median()), 1),
        "rainfall_mm": round(float(df["rainfall_mm"].median()), 1),
        "humidity_percent": round(float(df["humidity_%"].median()), 1),
        "sunlight_hours": round(float(df["sunlight_hours"].median()), 1),
        "record_count": int(len(df)),
    }


# General crop-cycle proportions (establishment/vegetative/reproductive/maturation). Durations are
# scaled to the crop's median total_days in the dataset; the split itself is a generic reference.
CYCLE_SPLIT = [("Establishment", 0.0, 0.15), ("Vegetative", 0.15, 0.5), ("Reproductive", 0.5, 0.8), ("Maturation", 0.8, 1.0)]


def crop_cycle(crop: str) -> Optional[dict]:
    df = get_df()
    c = df[df["crop_type"].str.lower() == crop.lower()]
    if c.empty:
        return None
    days = int(round(float(c["total_days"].median())))
    return {
        "crop": str(c["crop_type"].iloc[0]),
        "median_days": days,
        "stages": [{"name": n, "start_day": round(a * days), "end_day": round(b * days)} for n, a, b in CYCLE_SPLIT],
        "source": "Stage split is a general crop-cycle reference; total length is the dataset median for this crop.",
    }


# ------------------------------------------------------------------ soil


@lru_cache(maxsize=256)
def soil_assessment(f: Filters) -> dict:
    df = filter_df(f)
    if df.empty or not f.crop:
        raise ValueError("No records for this crop and region.")
    r = ar.rules_for(f.crop)
    assert r is not None
    ph, moist, ndvi = (float(df[c].mean()) for c in ("soil_pH", "soil_moisture_%", "NDVI_index"))
    ph_rng, m_rng, n_rng = r.optimal["soil_pH"], r.optimal["soil_moisture_%"], r.optimal["NDVI_index"]
    health = float(
        np.mean([ar.soil_health_index(f.crop, a, b) for a, b in df[["soil_pH", "soil_moisture_%"]].to_numpy()])
    )
    ph_status = "Optimal" if ph_rng.contains(ph) else ("Acidic" if ph < ph_rng.low else "Alkaline")
    sufficiency = float((df["soil_moisture_%"] >= m_rng.low).mean() * 100)

    def status(value: float, rng: ar.Range, lower_is_bad_only: bool = False) -> str:
        if rng.contains(value) or (lower_is_bad_only and value > rng.high):
            return "optimal"
        width = rng.high - rng.low
        dist = (rng.low - value) if value < rng.low else (value - rng.high)
        return "watch" if dist <= width * 0.5 else "critical"

    guidance = [
        {
            "status": status(ph, ph_rng),
            "finding": f"Average pH {ph:.2f} vs optimal {ph_rng.low:g}–{ph_rng.high:g}",
            "action": "No change needed." if ph_status == "Optimal" else (
                "Apply agricultural lime after a soil test." if ph_status == "Acidic" else "Apply sulfur or gypsum after a soil test."),
            "why": f"Top-yielding {r.crop} records cluster in this pH band.",
        },
        {
            "status": status(moist, m_rng),
            "finding": f"Average soil moisture {moist:.1f}% vs optimal {m_rng.low:g}–{m_rng.high:g}%",
            "action": "Maintain current irrigation." if m_rng.contains(moist) else (
                "Increase irrigation frequency." if moist < m_rng.low else "Improve drainage."),
            "why": f"{sufficiency:.0f}% of records meet the lower bound of the optimal moisture band.",
        },
        {
            "status": status(ndvi, n_rng, lower_is_bad_only=True),
            "finding": f"Average NDVI {ndvi:.2f} vs top-yield band {n_rng.low:g}–{n_rng.high:g}",
            "action": "Canopy vigour is on track." if ndvi >= n_rng.low else "Check nutrition and canopy health.",
            "why": "Reference only: NDVI in this dataset is derived from the yield itself, so it is not used by the model or the health index.",
        },
    ]

    suitability = []
    for crop in sorted(get_df()["crop_type"].unique()):
        idx = ar.soil_health_index(crop, ph, moist)
        cr = ar.rules_for(crop)
        assert cr is not None
        reasons = [
            f"{ar.FEATURES[k][0]} {'in' if cr.optimal[k].contains(v) else 'outside'} {cr.optimal[k].low:g}–{cr.optimal[k].high:g}"
            for k, v in (("soil_pH", ph), ("soil_moisture_%", moist))
        ]
        suitability.append({"crop": crop, "suitability_index": idx, "reasons": reasons})
    suitability.sort(key=lambda s: (-s["suitability_index"], s["crop"]))

    from backend.app.core import provenance

    bands = []
    for feature, rng in r.optimal.items():
        observed = float(df[feature].mean())
        label, unit = ar.FEATURES[feature]
        bands.append(
            {
                "feature": feature,
                "label": label,
                "unit": unit,
                "observed": round(observed, 2),
                "optimal_low": rng.low,
                "optimal_high": rng.high,
                "status": "optimal" if rng.contains(observed) else ("below" if observed < rng.low else "above"),
                "share_in_band": round(float(((df[feature] >= rng.low) & (df[feature] <= rng.high)).mean()), 4),
                "provenance": provenance.provenance_of(feature),
            }
        )

    return {
        "status_claim": "Soil assessment from dataset records",
        "optimal_bands": bands,
        "crop_type": r.crop,
        "scope": f.describe(),
        "soil_metrics": {
            "record_count": int(len(df)),
            "average_soil_pH": round(ph, 2),
            "optimal_pH_range": f"{ph_rng.low:g} – {ph_rng.high:g}",
            "optimal_ph_low": ph_rng.low,
            "optimal_ph_high": ph_rng.high,
            "pH_suitability_status": ph_status,
            "pH_recommendation": guidance[0]["action"],
            "average_soil_moisture_percent": round(moist, 1),
            "optimal_moisture_low": m_rng.low,
            "optimal_moisture_high": m_rng.high,
            "moisture_sufficiency_percent": round(sufficiency, 1),
            "average_NDVI_index": round(ndvi, 3),
            "optimal_ndvi_low": n_rng.low,
            "optimal_ndvi_high": n_rng.high,
            "soil_health_index": round(health, 3),
            "fertility_assessment": "High" if health >= 0.75 else "Moderate" if health >= 0.5 else "Low",
        },
        "global_soil_averages": {
            "soil_pH": round(float(get_df()["soil_pH"].mean()), 2),
            "soil_moisture_percent": round(float(get_df()["soil_moisture_%"].mean()), 1),
            "NDVI_index": round(float(get_df()["NDVI_index"].mean()), 3),
        },
        "guidance": guidance,
        "crop_suitability": suitability,
        "general_reference_note": "Optimal bands = P25–P75 among each crop's top-quartile-yield records in the dataset.",
    }
