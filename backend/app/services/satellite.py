"""Satellite crop health: MODIS NDVI (NASA Terra MOD13Q1, 250 m, 16-day composites) at a farm.

Source: the ORNL DAAC MODIS web service (public, no key). One request returns at most 10 composites
and takes several seconds, so the last 12 months and the same 12 months a year earlier are fetched
in parallel chunks and cached in MongoDB: closed periods for 180 days (past composites don't change),
the newest chunk for 8 days (a new composite appears every 16 days, about a month after acquisition).
"""
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from backend.app.core.observability import log
from backend.app.db import mongo

BASE = "https://modis.ornl.gov/rst/api/v1/MOD13Q1"
BAND = "250m_16_days_NDVI"
SCALE = 0.0001
CHUNK = 10  # composites per request (service limit)
TIMEOUT_S = 60
SOURCE = "NASA MODIS Terra MOD13Q1 NDVI (250 m, 16-day composites) via ORNL DAAC"


class SatelliteUnavailable(Exception):
    """The MODIS service could not be reached or returned no data."""


def _get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "YieldSenseAI/3.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        return json.loads(r.read().decode("utf-8"))


def _cached(key: str, ttl_days: int, fetch):
    hit = mongo.cache_get("satellite_cache", key)
    if hit is not None:
        return hit
    value = fetch()
    mongo.cache_set("satellite_cache", key, value, expires_at=datetime.now(timezone.utc) + timedelta(days=ttl_days))
    return value


def _dates(lat: float, lon: float) -> list[dict]:
    key = f"dates:{lat:.3f}:{lon:.3f}"
    return _cached(key, 8, lambda: _get(f"{BASE}/dates?latitude={lat:.4f}&longitude={lon:.4f}")["dates"])


def _chunk(lat: float, lon: float, dates: list[dict], newest: bool) -> list[dict]:
    start, end = dates[0]["modis_date"], dates[-1]["modis_date"]
    key = f"ndvi:{lat:.4f}:{lon:.4f}:{start}:{end}"

    def fetch() -> list[dict]:
        url = f"{BASE}/subset?latitude={lat:.4f}&longitude={lon:.4f}&band={BAND}&startDate={start}&endDate={end}&kmAboveBelow=0&kmLeftRight=0"
        out = []
        for s in _get(url).get("subset", []):
            raw = (s.get("data") or [None])[0]
            # Fill value -3000 and anything below -0.2 is cloud, water or missing data.
            value = round(raw * SCALE, 4) if raw is not None and raw * SCALE >= -0.2 else None
            out.append({"date": s["calendar_date"], "ndvi": value})
        return out

    return _cached(key, 8 if newest else 180, fetch)


def _series(lat: float, lon: float, dates: list[dict]) -> list[dict]:
    chunks = [dates[i : i + CHUNK] for i in range(0, len(dates), CHUNK)]
    with ThreadPoolExecutor(max_workers=len(chunks) or 1) as pool:
        parts = list(pool.map(lambda c: _chunk(lat, lon, c[1], c[0] == len(chunks) - 1), enumerate(chunks)))
    return [p for part in parts for p in part]


def health_status(change_pct: Optional[float]) -> tuple[str, str]:
    if change_pct is None:
        return "unknown", "Not enough cloud-free images to compare with last year."
    if change_pct >= -5:
        return "good", "Vegetation is at or above the same period last year."
    if change_pct >= -15:
        return "watch", "Vegetation is somewhat below the same period last year. Check the field for water stress, pests or late sowing."
    return "alert", "Vegetation is well below the same period last year. Inspect the field soon."


def ndvi_profile(lat: float, lon: float) -> dict:
    """Last 12 months of NDVI with the same composites a year earlier, and a health status."""
    try:
        dates = _dates(lat, lon)
    except Exception as e:
        log.warning(f"[satellite] dates failed: {e}")
        raise SatelliteUnavailable("The NASA MODIS service is unreachable right now. Try again later.")
    if not dates:
        raise SatelliteUnavailable("No MODIS images for this location.")
    recent = dates[-23:]
    first_recent = date.fromisoformat(recent[0]["calendar_date"])
    year_ago = [d for d in dates if first_recent - timedelta(days=372) <= date.fromisoformat(d["calendar_date"]) < first_recent - timedelta(days=4)][-23:]
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            cur_f = pool.submit(_series, lat, lon, recent)
            prev_f = pool.submit(_series, lat, lon, year_ago) if year_ago else None
            current = cur_f.result()
            previous = prev_f.result() if prev_f else []
    except Exception as e:
        log.warning(f"[satellite] subset failed: {e}")
        raise SatelliteUnavailable("The NASA MODIS service didn't answer in time. Try again in a minute.")

    # Pair each composite with the one closest to a year earlier.
    prev_by_doy = {}
    for p in previous:
        prev_by_doy[date.fromisoformat(p["date"]).timetuple().tm_yday] = p["ndvi"]
    points = []
    for c in current:
        doy = date.fromisoformat(c["date"]).timetuple().tm_yday
        near = min(prev_by_doy, key=lambda k: min(abs(k - doy), 366 - abs(k - doy))) if prev_by_doy else None
        points.append({"date": c["date"], "ndvi": c["ndvi"], "ndvi_last_year": prev_by_doy.get(near) if near is not None else None})

    # Status: mean of the latest 3 valid composites vs the same composites last year.
    pairs = [(p["ndvi"], p["ndvi_last_year"]) for p in points if p["ndvi"] is not None and p["ndvi_last_year"] is not None][-3:]
    latest = next((p for p in reversed(points) if p["ndvi"] is not None), None)
    change = None
    if pairs:
        now, before = sum(a for a, _ in pairs) / len(pairs), sum(b for _, b in pairs) / len(pairs)
        change = round((now - before) / before * 100, 1) if before > 0.05 else None
    status, message = health_status(change)
    return {
        "source": SOURCE,
        "latitude": lat,
        "longitude": lon,
        "points": points,
        "latest": latest,
        "change_vs_last_year_pct": change,
        "status": status,
        "message": message,
        "note": "NDVI near 0.1 or below is bare soil or water; 0.2–0.5 sparse or young crops; above 0.5 dense, healthy vegetation. "
        "A 250 m pixel can mix the field with its surroundings, and images arrive about a month after they are taken.",
    }
