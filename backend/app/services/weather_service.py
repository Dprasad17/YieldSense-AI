import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, Optional

import pandas as pd

from backend.app.services import dataset
from backend.app.core.observability import log


# Hand-picked coordinates inside the main agricultural zone of some countries. Every other
# dataset region is geocoded to its country centroid through the Open-Meteo geocoding API.
REGION_COORDINATES = {
    "india": {"lat": 28.6139, "lon": 77.2090, "name": "India (Indo-Gangetic Plain)"},
    "united states": {"lat": 41.8781, "lon": -87.6298, "name": "United States (Corn & Soy Belt)"},
    "brazil": {"lat": -15.7975, "lon": -47.8919, "name": "Brazil (Cerrado Agricultural Belt)"},
    "china": {"lat": 39.9042, "lon": 116.4074, "name": "China (North Plain)"},
    "france": {"lat": 48.8566, "lon": 2.3522, "name": "France (Paris Basin Grain Region)"},
    "germany": {"lat": 52.5200, "lon": 13.4050, "name": "Germany (Bavarian Agritech Region)"},
    "mexico": {"lat": 19.4326, "lon": -99.1332, "name": "Mexico (Central Agricultural Zone)"},
    "egypt": {"lat": 30.0444, "lon": 31.2357, "name": "Egypt (Nile Delta Irrigation Zone)"},
    "australia": {"lat": -33.8688, "lon": 151.2093, "name": "Australia (Grain & Wheat Belt)"},
    "south africa": {"lat": -25.7479, "lon": 28.1878, "name": "South Africa (Highveld Maize Belt)"},
    "pakistan": {"lat": 31.5204, "lon": 74.3587, "name": "Pakistan (Punjab Basin)"},
    "nigeria": {"lat": 9.0765, "lon": 7.3986, "name": "Nigeria (Savannah Agro-Zone)"},
    "spain": {"lat": 40.4168, "lon": -3.7038, "name": "Spain (Iberian Agricultural Plain)"},
    "turkey": {"lat": 39.9334, "lon": 32.8597, "name": "Turkey (Anatolia Plateau)"},
    "canada": {"lat": 51.0447, "lon": -114.0719, "name": "Canada (Prairie Wheat Belt)"},
}

FORECAST_DAYS = 7
HTTP_TIMEOUT_S = 8


class LiveWeatherUnavailable(Exception):
    """Open-Meteo could not be reached or has no data for the region."""


def _fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "YieldSenseAI/1.0"})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _http_get_json(url: str) -> dict:
    """Open-Meteo GET with a MongoDB cache (TTL index removes entries after WEATHER_CACHE_SECONDS)."""
    from datetime import timedelta

    from backend.app.core.config import settings
    from backend.app.db import mongo

    cached = mongo.cache_get("weather_cache", url)
    if cached is not None:
        return cached
    data = _fetch_json(url)
    mongo.cache_set("weather_cache", url, data, expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.WEATHER_CACHE_SECONDS))
    return data


@lru_cache(maxsize=256)
def _geocode_country(name: str) -> Optional[dict]:
    url = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode({"name": name, "count": 10})
    try:
        results = _http_get_json(url).get("results") or []
    except Exception as e:
        log.warning(f"[WeatherService] Geocoding failed for {name!r}: {e}")
        return None
    # Country-level entries carry a PCL* GeoNames feature code (PCLI = independent political entity).
    for r in results:
        if str(r.get("feature_code", "")).startswith("PCL"):
            return {"lat": r["latitude"], "lon": r["longitude"], "name": f"{name} (country centroid)"}
    return None


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _share_in_band(df, feature: str) -> float:
    """Share of records whose value sits inside their own crop's optimal band (agronomy rules)."""
    from backend.app.core.agronomy_rules import rules_for

    hits = 0
    for crop, g in df.groupby("crop_type"):
        r = rules_for(str(crop))
        if r:
            rng = r.optimal[feature]
            hits += int(g[feature].between(rng.low, rng.high).sum())
    return hits / len(df) if len(df) else 0.0


@lru_cache(maxsize=256)
def regional_weather_scores(region: Optional[str]) -> Dict[str, Any]:
    """Weather scores (0–100) for a region, each judged against the record's own crop:
    rainfall / humidity / sunlight = % of records inside the crop's optimal band;
    temperature stress = % of records above the crop's optimal temperature band.
    Overall = 0.35·rain + 0.30·(100 − stress) + 0.20·humidity + 0.15·sunlight."""
    from backend.app.core.agronomy_rules import rules_for

    df = dataset.filter_df(dataset.Filters.of(region=region))
    stressed = 0
    for crop, g in df.groupby("crop_type"):
        r = rules_for(str(crop))
        if r:
            stressed += int((g["temperature_C"] > r.optimal["temperature_C"].high).sum())
    rain = _share_in_band(df, "rainfall_mm") * 100
    humidity = _share_in_band(df, "humidity_%") * 100
    sun = _share_in_band(df, "sunlight_hours") * 100
    stress = stressed / len(df) * 100 if len(df) else 0.0
    overall = rain * 0.35 + (100 - stress) * 0.30 + humidity * 0.20 + sun * 0.15
    return {
        "record_count": int(len(df)),
        "average_rainfall_mm": round(float(df["rainfall_mm"].mean()), 1),
        "median_rainfall_mm": round(float(df["rainfall_mm"].median()), 1),
        "average_temperature_C": round(float(df["temperature_C"].mean()), 1),
        "average_humidity_percent": round(float(df["humidity_%"].mean()), 1),
        "average_sunlight_hours": round(float(df["sunlight_hours"].mean()), 1),
        "rainfall_adequacy_score": round(rain, 1),
        "temperature_stress_risk": round(stress, 1),
        "humidity_balance_score": round(humidity, 1),
        "sunlight_exposure_score": round(sun, 1),
        "overall_weather_score": round(overall, 1),
    }


class WeatherService:
    def get_weather_analytics(self, region: Optional[str] = None, live: bool = False) -> Dict[str, Any]:
        if live:
            if not region:
                raise ValueError("Choose a region to see live weather.")
            return self._fetch_live_open_meteo(region)
        return self._dataset_analytics(region)

    # ------------------------------------------------------------------ dataset mode
    def _dataset_analytics(self, region: Optional[str]) -> Dict[str, Any]:
        regions = dataset.regions()
        name = dataset.canonical(region, "region") if region else None
        if region and not name:
            raise ValueError(f"No weather records for region '{region}'.")
        return {
            "mode": "dataset",
            "status_claim": "Dataset weather records",
            "data_source": "YieldSense dataset",
            "period": f"All dataset years ({dataset.year_range()[0]}–{dataset.year_range()[1]})",
            "region": name or "All regions",
            "analytics": regional_weather_scores(name),
            "available_regions": regions,
            "current": None,
            "forecast": [],
            "fetched_at": None,
        }

    # ------------------------------------------------------------------ live mode
    def _coordinates(self, region: str) -> dict:
        key = region.strip().lower()
        coords = REGION_COORDINATES.get(key) or _geocode_country(region.strip())
        if not coords:
            raise LiveWeatherUnavailable(f"Live weather isn't available for '{region}'.")
        return coords

    def _fetch_live_open_meteo(self, region: str) -> Dict[str, Any]:
        coords = self._coordinates(region)
        url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(
            {
                "latitude": coords["lat"],
                "longitude": coords["lon"],
                "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration",
                "forecast_days": FORECAST_DAYS,
                "timezone": "auto",
            }
        )
        try:
            res = _http_get_json(url)
        except Exception as e:
            log.warning(f"[WeatherService] Live API call failed: {e}")
            raise LiveWeatherUnavailable("Open-Meteo is unreachable right now. Switch to dataset mode or try again.")

        current = res.get("current") or {}
        daily = res.get("daily") or {}
        days = daily.get("time") or []
        if not current or not days:
            raise LiveWeatherUnavailable("Open-Meteo returned no data for this location.")

        def col(name: str) -> list:
            return [(v if v is not None else 0.0) for v in (daily.get(name) or [0.0] * len(days))]

        tmax, tmin, precip = col("temperature_2m_max"), col("temperature_2m_min"), col("precipitation_sum")
        sunshine_h = [s / 3600.0 for s in col("sunshine_duration")]  # Open-Meteo reports seconds

        forecast = [
            {
                "date": d,
                "temp_max_C": round(float(tmax[i]), 1),
                "temp_min_C": round(float(tmin[i]), 1),
                "precipitation_mm": round(float(precip[i]), 1),
                "sunshine_hours": round(float(sunshine_h[i]), 1),
            }
            for i, d in enumerate(days)
        ]

        temp = float(current.get("temperature_2m", 0.0))
        humidity = float(current.get("relative_humidity_2m", 0.0))
        rain_total = float(sum(precip))
        mean_sun = float(sum(sunshine_h) / len(sunshine_h)) if sunshine_h else 0.0

        # Scores (0–100). Rainfall and humidity bands are the pre-existing live heuristics; sunshine
        # is scored against the dataset's median daily sunlight so both modes share a reference.
        ref_sun = float(dataset.get_df()["sunlight_hours"].median())
        rain_adequacy = _clamp((rain_total / FORECAST_DAYS / 10.0) * 100, 20.0) if rain_total > 0 else 40.0
        temp_stress = _clamp(abs(temp - 24.0) / 15.0 * 100)
        humidity_balance = _clamp(100.0 - abs(humidity - 65.0) * 1.5, 20.0)
        sunlight_score = _clamp(mean_sun / ref_sun * 100) if ref_sun else 0.0
        overall = rain_adequacy * 0.35 + (100.0 - temp_stress) * 0.30 + humidity_balance * 0.20 + sunlight_score * 0.15

        return {
            "mode": "live",
            "status_claim": f"Live Open-Meteo forecast · {coords['name']}",
            "data_source": "Open-Meteo",
            "period": f"{FORECAST_DAYS}-day forecast",
            "region": region.strip(),
            "analytics": {
                "record_count": len(days),
                "average_rainfall_mm": round(rain_total, 1),
                "average_temperature_C": round(temp, 1),
                "average_humidity_percent": round(humidity, 1),
                "average_sunlight_hours": round(mean_sun, 1),
                "wind_speed_kmh": round(float(current.get("wind_speed_10m", 0.0)), 1),
                "rainfall_adequacy_score": round(rain_adequacy, 1),
                "temperature_stress_risk": round(temp_stress, 1),
                "humidity_balance_score": round(humidity_balance, 1),
                "sunlight_exposure_score": round(sunlight_score, 1),
                "overall_weather_score": round(overall, 1),
            },
            "available_regions": dataset.regions(),
            "current": {
                "temperature_C": round(temp, 1),
                "humidity_percent": round(humidity, 1),
                "precipitation_mm": round(float(current.get("precipitation", 0.0)), 1),
                "wind_speed_kmh": round(float(current.get("wind_speed_10m", 0.0)), 1),
                "observed_at": current.get("time"),
            },
            "forecast": forecast,
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }


weather_service = WeatherService()


# ------------------------------------------------------------------ yearly climate trend

ARCHIVE_FIRST_YEAR = 1990
ARCHIVE_TIMEOUT_S = 25


def _archive_json(url: str) -> dict:
    """ERA5 reanalysis from the Open-Meteo archive, cached in MongoDB for 30 days (past years don't change)."""
    from datetime import timedelta

    from backend.app.db import mongo

    cached = mongo.cache_get("weather_cache", url)
    if cached is not None:
        return cached
    req = urllib.request.Request(url, headers={"User-Agent": "YieldSenseAI/1.0"})
    with urllib.request.urlopen(req, timeout=ARCHIVE_TIMEOUT_S) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    mongo.cache_set("weather_cache", url, data, expires_at=datetime.now(timezone.utc) + timedelta(days=30))
    return data


def _slope_per_decade(years: list[int], values: list[float]) -> Optional[float]:
    import numpy as np

    if len(years) < 5:
        return None
    return round(float(np.polyfit(years, values, 1)[0]) * 10, 3)


def climate_trend(region: str) -> Dict[str, Any]:
    """Yearly mean temperature and total precipitation for a region: ERA5 (Open-Meteo archive) at the
    region's agricultural reference point, next to the dataset's own yearly values for that country."""
    from backend.app.services.dataset import canonical, get_df

    name = canonical(region, "region") or region
    df = get_df()
    rows = df[df["region"] == name]
    dataset_years = []
    if len(rows):
        g = rows.groupby("year").agg(temperature_C=("temperature_C", "mean"), rainfall_mm=("rainfall_mm", "mean"))
        dataset_years = [
            {"year": int(y), "temperature_C": round(float(r.temperature_C), 2), "rainfall_mm": round(float(r.rainfall_mm), 1)}
            for y, r in g.sort_index().iterrows()
        ]

    archive: list[dict] = []
    location = None
    error = None
    try:
        coords = weather_service._coordinates(name)
        location = {"latitude": coords["lat"], "longitude": coords["lon"], "label": coords["name"]}
        last = datetime.now(timezone.utc).year - 1
        url = "https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode(
            {
                "latitude": coords["lat"],
                "longitude": coords["lon"],
                "start_date": f"{ARCHIVE_FIRST_YEAR}-01-01",
                "end_date": f"{last}-12-31",
                "daily": "temperature_2m_mean,precipitation_sum",
                "timezone": "auto",
            }
        )
        daily = (_archive_json(url).get("daily") or {})
        frame = pd.DataFrame(
            {"time": daily.get("time") or [], "t": daily.get("temperature_2m_mean") or [], "p": daily.get("precipitation_sum") or []}
        )
        if len(frame):
            frame["year"] = frame["time"].str.slice(0, 4).astype(int)
            yearly = frame.groupby("year").agg(t=("t", "mean"), p=("p", "sum"), n=("t", "count"))
            archive = [
                {"year": int(y), "temperature_C": round(float(r.t), 2), "precipitation_mm": round(float(r.p), 1)}
                for y, r in yearly.iterrows()
                if r.n >= 360  # complete years only
            ]
    except LiveWeatherUnavailable as e:
        error = str(e)
    except Exception as e:  # network or parsing: keep the dataset series
        log.warning(f"[WeatherService] Archive call failed: {e}")
        error = "The Open-Meteo climate archive is unreachable right now; showing dataset values only."

    return {
        "region": name,
        "location": location,
        "archive_source": "ERA5 reanalysis via Open-Meteo archive API" if archive else None,
        "archive": archive,
        "dataset": dataset_years,
        "temperature_trend_C_per_decade": _slope_per_decade([a["year"] for a in archive], [a["temperature_C"] for a in archive]) if archive else None,
        "precipitation_trend_mm_per_decade": _slope_per_decade([a["year"] for a in archive], [a["precipitation_mm"] for a in archive]) if archive else None,
        "note": "The dataset's rainfall is a long-term country average (constant across years); its temperature varies by year.",
        "error": error,
    }
