"""Build datasets/processed/weather_reference.json, the offline weather snapshot.

- coordinates: country centroid (Open-Meteo geocoding) for every dataset region without hand-picked
  coordinates, so the app never needs the geocoding API at run time;
- climate: ERA5 yearly mean temperature and total precipitation (Open-Meteo archive) for the
  hand-picked regions, used when the archive API refuses requests (HTTP 429 from shared cloud IPs).

Run from the repository root on a machine where Open-Meteo answers:
    python scripts/build_weather_reference.py
Archive requests are heavy for Open-Meteo's free quota, so the script pauses between them.
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pandas as pd  # noqa: E402

from backend.app.services import dataset  # noqa: E402
from backend.app.services.weather_service import (  # noqa: E402
    ARCHIVE_FIRST_YEAR,
    REFERENCE_PATH,
    REGION_COORDINATES,
    _fetch_json,
)

ARCHIVE_PAUSE_S = 25


def centroid(name: str) -> dict | None:
    url = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode({"name": name, "count": 10})
    for attempt in range(3):
        try:
            results = _fetch_json(url).get("results") or []
            break
        except Exception as e:
            print(f"    geocoding attempt {attempt + 1} failed: {e}")
            time.sleep(10)
    else:
        return None
    for r in results:
        if str(r.get("feature_code", "")).startswith("PCL"):
            return {"lat": r["latitude"], "lon": r["longitude"], "name": f"{name} (country centroid)"}
    return None


def yearly_climate(lat: float, lon: float) -> list[dict]:
    last = datetime.now(timezone.utc).year - 1
    url = "https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lon,
            "start_date": f"{ARCHIVE_FIRST_YEAR}-01-01",
            "end_date": f"{last}-12-31",
            "daily": "temperature_2m_mean,precipitation_sum",
            "timezone": "auto",
        }
    )
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "YieldSenseAI/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                daily = json.loads(resp.read().decode("utf-8")).get("daily") or {}
            break
        except Exception as e:  # rate limit: wait and retry
            print(f"    archive attempt {attempt + 1} failed: {e}")
            time.sleep(70)
    else:
        return []
    frame = pd.DataFrame({"time": daily.get("time") or [], "t": daily.get("temperature_2m_mean") or [], "p": daily.get("precipitation_sum") or []})
    frame["year"] = frame["time"].str.slice(0, 4).astype(int)
    yearly = frame.groupby("year").agg(t=("t", "mean"), p=("p", "sum"), n=("t", "count"))
    return [
        {"year": int(y), "temperature_C": round(float(r.t), 2), "precipitation_mm": round(float(r.p), 1)}
        for y, r in yearly.iterrows()
        if r.n >= 360
    ]


def main() -> int:
    out = {"generated": date.today().isoformat(), "coordinates": {}, "climate": {}}
    if os.path.exists(REFERENCE_PATH):
        with open(REFERENCE_PATH, encoding="utf-8") as f:
            out.update({k: v for k, v in json.load(f).items() if k in ("coordinates", "climate")})

    for region in dataset.regions():
        key = region.lower()
        if key in REGION_COORDINATES or key in out["coordinates"]:
            continue
        c = centroid(region)
        print(f"centroid  {region}: {'ok' if c else 'not found'}")
        if c:
            out["coordinates"][key] = c

    regions = {dataset.canonical(k, "region") or k.title(): v for k, v in REGION_COORDINATES.items()}
    for name, c in regions.items():
        if out["climate"].get(name, {}).get("archive"):
            continue
        print(f"archive   {name} …")
        archive = yearly_climate(c["lat"], c["lon"])
        print(f"    {len(archive)} years")
        if archive:
            out["climate"][name] = {"fetched": date.today().isoformat(), "archive": archive}
        with open(REFERENCE_PATH, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=1)
        time.sleep(ARCHIVE_PAUSE_S)

    with open(REFERENCE_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(f"wrote {REFERENCE_PATH}: {len(out['coordinates'])} centroids, {len(out['climate'])} climate series")
    return 0


if __name__ == "__main__":
    sys.exit(main())
