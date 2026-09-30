import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, Optional

from backend.app.services import dataset


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


def _http_get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "YieldSenseAI/1.0"})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
        return json.loads(resp.read().decode("utf-8"))


@lru_cache(maxsize=256)
def _geocode_country(name: str) -> Optional[dict]:
    url = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode({"name": name, "count": 10})
    try:
        results = _http_get_json(url).get("results") or []
    except Exception as e:
        print(f"[WeatherService] Geocoding failed for {name!r}: {e}")
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
            print(f"[WeatherService] Live API call failed: {e}")
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
