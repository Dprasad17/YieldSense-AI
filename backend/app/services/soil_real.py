"""
Real soil data for farms: ISRIC SoilGrids 2.0 (0–30 cm) plus the farm's own soil tests.

SoilGrids values are fetched per point (farm coordinates, or the region's reference point) and cached
in MongoDB for 180 days. If SoilGrids can't be reached the caller gets SoilGridsUnavailable; nothing
falls back to the synthetic dataset columns.

Nutrient ratings (soil tests) follow the Indian Soil Health Card critical limits used by ICAR:
  - Available N (alkaline KMnO4, Subbiah & Asija 1956): Low < 280, Medium 280–560, High > 560 kg N/ha
  - Available P (Olsen): Low < 10, Medium 10–25, High > 25 kg P/ha (elemental P;
    × 2.29 = kg P2O5/ha, i.e. 22.9 / 57.3 kg P2O5/ha)
  - Available K (neutral 1 N NH4OAc): Low < 120, Medium 120–280, High > 280 kg K/ha (elemental K;
    × 1.205 = kg K2O/ha)
  - Organic carbon (Walkley–Black): Low < 0.5 %, Medium 0.5–0.75 %, High > 0.75 %
  Source: Soil Health Card scheme critical limits (Ministry of Agriculture & Farmers Welfare / ICAR,
  as reproduced by Delhi district soil health card notices and TNAU Agritech). Some state charts differ
  (e.g. TNAU: N 240/480, P 11/22, K 110/280). The unit basis for P and K in the national table could not
  be confirmed from an official source, so we treat the numbers as elemental and show oxide equivalents.
"""
import json
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"
SOILGRIDS_TIMEOUT_S = 30
CACHE_DAYS = 180
USER_AGENT = "YieldSenseAI/2.1"
DEPTHS = [("0-5cm", 5), ("5-15cm", 10), ("15-30cm", 15)]  # label, thickness (cm) for the 0–30 cm weighted mean

# SoilGrids property -> (our key, label, unit, divisor from mapped units to the unit shown)
PROPERTIES = {
    "phh2o": ("ph", "pH (H2O)", "", 10),
    "soc": ("organic_carbon_percent", "Organic carbon", "%", 100),  # dg/kg -> g/kg (/10) -> % (/10)
    "nitrogen": ("total_nitrogen_g_kg", "Total nitrogen", "g/kg", 100),  # cg/kg -> g/kg
    "clay": ("clay_percent", "Clay", "%", 10),  # g/kg -> %
    "sand": ("sand_percent", "Sand", "%", 10),
    "cec": ("cec_cmol_kg", "CEC", "cmol(c)/kg", 10),  # mmol(c)/kg -> cmol(c)/kg
}

P2O5_PER_P = 2.291
K2O_PER_K = 1.205
OM_TO_OC = 1 / 1.724  # van Bemmelen factor

NUTRIENT_LIMITS = {
    "nitrogen_kg_ha": ("Available N", "kg N/ha", 280, 560),
    "phosphorus_kg_ha": ("Available P", "kg P/ha", 10, 25),
    "potassium_kg_ha": ("Available K", "kg K/ha", 120, 280),
    "organic_carbon_percent": ("Organic carbon", "%", 0.5, 0.75),
}
NUTRIENT_SOURCE = (
    "Soil Health Card critical limits (ICAR): N 280/560 kg/ha; P 10/25 kg P/ha (Olsen); "
    "K 120/280 kg K/ha (NH4OAc); organic carbon 0.5/0.75 %. P and K treated as elemental."
)

GUIDANCE = {
    ("nitrogen_kg_ha", "Low"): "Apply the full recommended N dose in 2–3 splits; add FYM or green manure.",
    ("nitrogen_kg_ha", "Medium"): "Apply the recommended N dose.",
    ("nitrogen_kg_ha", "High"): "Reduce N by about 25 % of the recommended dose.",
    ("phosphorus_kg_ha", "Low"): "Apply 125–150 % of the recommended P2O5 (e.g. DAP/SSP) at sowing.",
    ("phosphorus_kg_ha", "Medium"): "Apply the recommended P2O5 dose.",
    ("phosphorus_kg_ha", "High"): "Reduce P2O5 by about 25–50 %; P builds up in soil.",
    ("potassium_kg_ha", "Low"): "Apply 125–150 % of the recommended K2O (MOP).",
    ("potassium_kg_ha", "Medium"): "Apply the recommended K2O dose.",
    ("potassium_kg_ha", "High"): "K2O can be reduced or skipped this season.",
    ("organic_carbon_percent", "Low"): "Add organic matter: FYM/compost 5–10 t/ha, crop residue retention.",
    ("organic_carbon_percent", "Medium"): "Maintain organic inputs and residue retention.",
    ("organic_carbon_percent", "High"): "Good organic status; keep current practice.",
}

# General agronomic optimal soil pH ranges per crop (approximate, rounded; varieties differ). Verify locally.
CROP_PH = {
    "Rice": (5.5, 7.0), "Wheat": (6.0, 7.5), "Maize": (5.8, 7.0), "Potato": (5.0, 6.5), "Soybean": (6.0, 7.0),
    "Cassava": (5.5, 6.5), "Sorghum": (5.5, 7.5), "Sweet Potato": (5.5, 6.5), "Plantains": (5.5, 7.0), "Yams": (5.5, 6.5),
}
CROP_PH_SOURCE = "Crop pH ranges are general agronomic guides (approximate); verify with local extension advice."


class SoilGridsUnavailable(Exception):
    """SoilGrids could not be reached or returned no data for the point."""


def _http_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=SOILGRIDS_TIMEOUT_S) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _parse(raw: dict) -> dict:
    layers = {l["name"]: l for l in (raw.get("properties") or {}).get("layers") or []}
    out: dict[str, Any] = {}
    for prop, (key, label, unit, div) in PROPERTIES.items():
        layer = layers.get(prop)
        if not layer:
            raise SoilGridsUnavailable(f"SoilGrids returned no {label} data for this location.")
        by_depth = {d["label"]: (d.get("values") or {}).get("mean") for d in layer["depths"]}
        vals = [(by_depth.get(lbl), w) for lbl, w in DEPTHS]
        if any(v is None for v, _ in vals):
            raise SoilGridsUnavailable("SoilGrids has no soil data at this point (water, urban or outside coverage).")
        weighted = sum(v * w for v, w in vals) / sum(w for _, w in vals)
        out[key] = {"label": label, "unit": unit, "value_0_30cm": round(weighted / div, 2), "by_depth": {lbl: round(v / div, 2) for (v, _), (lbl, _) in zip(vals, DEPTHS)}}
    return out


def fetch_soilgrids(lat: float, lon: float) -> dict:
    """0–30 cm SoilGrids properties at a point (cached)."""
    from backend.app.db import mongo

    key = f"{round(lat, 3)},{round(lon, 3)}"
    cached = mongo.cache_get("soilgrids_cache", key)
    if cached is not None:
        return {**cached, "cached": True}
    params = [("lon", lon), ("lat", lat), *[("property", p) for p in PROPERTIES], *[("depth", d) for d, _ in DEPTHS], ("value", "mean")]
    try:
        raw = _http_json(SOILGRIDS_URL + "?" + urllib.parse.urlencode(params))
    except Exception as e:
        raise SoilGridsUnavailable(f"SoilGrids (ISRIC) is unreachable right now: {e.__class__.__name__}. Try again later.") from e
    data = {"latitude": lat, "longitude": lon, "properties": _parse(raw), "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    mongo.cache_set("soilgrids_cache", key, data, expires_at=datetime.now(timezone.utc) + timedelta(days=CACHE_DAYS))
    return {**data, "cached": False}


def rate(value: Optional[float], low: float, high: float) -> Optional[str]:
    if value is None:
        return None
    return "Low" if value < low else "High" if value > high else "Medium"


def nutrient_ratings(test: dict) -> list[dict]:
    """Low/Medium/High for a soil test's N, P, K and organic carbon, with fertilizer guidance."""
    values = dict(test)
    if values.get("organic_carbon_percent") is None and values.get("organic_matter_percent") is not None:
        values["organic_carbon_percent"] = round(values["organic_matter_percent"] * OM_TO_OC, 3)
    out = []
    for key, (label, unit, low, high) in NUTRIENT_LIMITS.items():
        v = values.get(key)
        r = rate(v, low, high)
        item = {"nutrient": key, "label": label, "unit": unit, "value": v, "rating": r, "low_below": low, "high_above": high, "guidance": GUIDANCE.get((key, r)) if r else None}
        if key == "phosphorus_kg_ha" and v is not None:
            item["oxide_equivalent"] = f"{v * P2O5_PER_P:.1f} kg P2O5/ha"
        if key == "potassium_kg_ha" and v is not None:
            item["oxide_equivalent"] = f"{v * K2O_PER_K:.1f} kg K2O/ha"
        out.append(item)
    return out


def ph_rating(ph: float) -> str:
    if ph < 5.5:
        return "Strongly acidic"
    if ph < 6.5:
        return "Moderately acidic"
    if ph <= 7.5:
        return "Neutral"
    if ph <= 8.5:
        return "Moderately alkaline"
    return "Strongly alkaline"


def _score(value: float, low: float, high: float) -> float:
    if low <= value <= high:
        return 1.0
    width = max(high - low, 1e-6)
    dist = (low - value) if value < low else (value - high)
    return max(0.0, 1.0 - dist / width)


def texture_class(clay: float, sand: float) -> str:
    """Simplified USDA texture grouping from clay and sand only."""
    if clay >= 40:
        return "Clay"
    if sand >= 70:
        return "Sandy"
    if clay >= 27:
        return "Clay loam"
    if sand >= 50:
        return "Sandy loam"
    return "Loam"


def farm_soil_assessment(soil: dict, tests: list[dict], crops: list[str]) -> dict:
    """Health, fertility and crop suitability from real values: the latest soil test where present,
    otherwise SoilGrids. Every metric says which source it used."""
    props = soil["properties"]
    latest = tests[0] if tests else None
    ph, ph_src = (latest["ph"], "soil test") if latest and latest.get("ph") is not None else (props["ph"]["value_0_30cm"], "SoilGrids")
    oc = None
    oc_src = "SoilGrids"
    if latest:
        if latest.get("organic_carbon_percent") is not None:
            oc, oc_src = latest["organic_carbon_percent"], "soil test"
        elif latest.get("organic_matter_percent") is not None:
            oc, oc_src = round(latest["organic_matter_percent"] * OM_TO_OC, 3), "soil test (organic matter ÷ 1.724)"
    if oc is None:
        oc = props["organic_carbon_percent"]["value_0_30cm"]
    cec = props["cec_cmol_kg"]["value_0_30cm"]
    oc_rating = rate(oc, 0.5, 0.75)
    cec_rating = rate(cec, 10, 25)
    points = {"Low": 0.33, "Medium": 0.67, "High": 1.0}
    fertility_score = round((points[oc_rating] + points[cec_rating]) / 2, 3)

    suitability = []
    for crop in sorted(CROP_PH):
        lo, hi = CROP_PH[crop]
        s = _score(ph, lo, hi)
        suitability.append({
            "crop": crop,
            "grown_on_farm": crop in crops,
            "ph_range": f"{lo:g}–{hi:g}",
            "ph_score": round(s, 3),
            "suitability_index": round((s + fertility_score) / 2, 3),
            "reasons": [f"pH {ph:.1f} {'inside' if lo <= ph <= hi else 'outside'} {lo:g}–{hi:g}", f"Organic carbon {oc_rating.lower()}, CEC {cec_rating.lower()}"],
        })
    suitability.sort(key=lambda r: (-r["suitability_index"], r["crop"]))
    main = [r for r in suitability if r["grown_on_farm"]] or suitability[:1]
    health = round(sum(r["suitability_index"] for r in main) / len(main), 3)
    return {
        "ph": {"value": round(ph, 2), "source": ph_src, "rating": ph_rating(ph)},
        "organic_carbon": {"value_percent": round(oc, 2), "source": oc_src, "rating": oc_rating},
        "cec": {"value": cec, "unit": "cmol(c)/kg", "source": "SoilGrids", "rating": cec_rating},
        "texture": texture_class(props["clay_percent"]["value_0_30cm"], props["sand_percent"]["value_0_30cm"]),
        "fertility": {"score": fertility_score, "class": "High" if fertility_score >= 0.8 else "Moderate" if fertility_score >= 0.5 else "Low", "basis": "Organic carbon (0.5/0.75 %) and CEC (10/25 cmol(c)/kg)"},
        "soil_health_index": health,
        "crop_suitability": suitability,
        "method": f"Health index = mean of pH fit to the farm's crops and fertility score. {CROP_PH_SOURCE}",
    }
