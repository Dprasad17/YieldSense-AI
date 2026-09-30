"""
Seed PostgreSQL + MongoDB for YieldSense.

  python scripts/seed.py            # idempotent: fills what is missing
  python scripts/seed.py --reset    # truncates crop_records and demo farms first

- crop_records: the reference dataset (datasets/processed/cleaned_crop_yield.csv) via COPY
- users: the three demo accounts (bcrypt)
- farms + farm_records: three demo farms for the farmer account. Season yields, rainfall,
  temperature and pesticide use are taken from the reference dataset for the farm's
  country, crop and year (FAOSTAT country-level values), so no screen is empty.
- MongoDB indexes (TTL caches, uploads, soil tests)
"""
import io
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pandas as pd  # noqa: E402
from sqlalchemy import delete, func, select, text  # noqa: E402

from backend.app.core.config import settings  # noqa: E402
from backend.app.core.security import hash_password  # noqa: E402
from backend.app.db import mongo  # noqa: E402
from backend.app.db.models import Farm, FarmRecord, User  # noqa: E402
from backend.app.db.session import engine, session_scope  # noqa: E402
from backend.app.services.users import DEFAULT_NOTIFICATION_PREFS, DEMO_USERS  # noqa: E402

CSV_COLUMNS = {
    "farm_id": "record_code",
    "region": "region",
    "crop_type": "crop_type",
    "yield_kg_per_hectare": "yield_kg_per_hectare",
    "rainfall_mm": "rainfall_mm",
    "temperature_C": "temperature_c",
    "pesticide_usage_ml": "pesticide_usage_ml",
    "soil_pH": "soil_ph",
    "soil_moisture_%": "soil_moisture_percent",
    "humidity_%": "humidity_percent",
    "sunlight_hours": "sunlight_hours",
    "total_days": "total_days",
    "sowing_date": "sowing_date",
    "harvest_date": "harvest_date",
    "irrigation_type": "irrigation_type",
    "fertilizer_type": "fertilizer_type",
    "crop_disease_status": "crop_disease_status",
    "NDVI_index": "ndvi_index",
}

# Coordinates are farmland points (Karnal district, central Punjab, Bogura), not city centres: SoilGrids masks urban pixels.
DEMO_FARMS = [
    {"name": "Green Valley Farm", "region": "India", "area_ha": 12.5, "crops": ["Rice", "Wheat"], "irrigation_type": "Drip", "soil_ph": 6.4, "soil_moisture_percent": 38.0, "soil_type": "Alluvial loam", "latitude": 29.69, "longitude": 76.85},
    {"name": "Riverbend Fields", "region": "Pakistan", "area_ha": 20.0, "crops": ["Wheat", "Maize"], "irrigation_type": "Flood", "soil_ph": 7.6, "soil_moisture_percent": 31.0, "soil_type": "Silty clay", "latitude": 31.85, "longitude": 73.95},
    {"name": "Hillside Potatoes", "region": "Bangladesh", "area_ha": 6.0, "crops": ["Potato", "Rice"], "irrigation_type": "Sprinkler", "soil_ph": 5.9, "soil_moisture_percent": 44.0, "soil_type": "Sandy loam", "latitude": 24.95, "longitude": 89.25},
]
SEASONS = range(2009, 2014)


def seed_crop_records(reset: bool) -> int:
    """Loads the reference dataset; returns the number of rows loaded (0 when already present)."""
    with session_scope() as s:
        count = s.scalar(text("SELECT count(*) FROM crop_records WHERE source = 'reference'")) or 0
        if reset:
            s.execute(text("DELETE FROM crop_records WHERE source = 'reference'"))
            count = 0
    if count:
        print(f"crop_records: {count:,} reference rows already present")
        return 0
    df = pd.read_csv(settings.DATASET_PATH)
    df = df[list(CSV_COLUMNS)].rename(columns=CSV_COLUMNS)
    df["year"] = pd.to_datetime(df["sowing_date"]).dt.year
    df["crop_disease_status"] = df["crop_disease_status"].fillna("None")
    df["source"] = "reference"
    cols = list(df.columns)
    buf = io.StringIO()
    df.to_csv(buf, index=False, header=False)
    buf.seek(0)
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cur:
            with cur.copy(f"COPY crop_records ({', '.join(cols)}) FROM STDIN WITH (FORMAT csv)") as cp:
                cp.write(buf.getvalue())
        raw.commit()
    finally:
        raw.close()
    print(f"crop_records: inserted {len(df):,} reference rows")
    return int(len(df))


def seed_users() -> None:
    with session_scope() as s:
        for username, (password, role, email, full_name) in DEMO_USERS.items():
            exists = s.scalar(select(User).where(func.lower(User.username) == username))
            if exists:
                continue
            s.add(User(username=username, email=email, full_name=full_name, role=role, hashed_password=hash_password(password), hash_scheme="bcrypt", active=True, notification_prefs=dict(DEFAULT_NOTIFICATION_PREFS)))
            print(f"users: created {username}")


def seed_farms(reset: bool) -> None:
    ref = pd.read_sql("SELECT region, crop_type, year, yield_kg_per_hectare, rainfall_mm, temperature_c, pesticide_usage_ml FROM crop_records WHERE source = 'reference'", engine)
    ref = ref.groupby(["region", "crop_type", "year"]).mean(numeric_only=True).reset_index()
    with session_scope() as s:
        farmer = s.scalar(select(User).where(func.lower(User.username) == "farmer"))
        assert farmer is not None
        if reset:
            s.execute(delete(Farm).where(Farm.owner_id == farmer.id, Farm.name.in_([f["name"] for f in DEMO_FARMS])))
        for spec in DEMO_FARMS:
            if s.scalar(select(Farm).where(Farm.owner_id == farmer.id, Farm.name == spec["name"])):
                continue
            farm = Farm(owner_id=farmer.id, notes="Demo farm. Season values come from the reference dataset for this country, crop and year.", **spec)
            s.add(farm)
            s.flush()
            for i, year in enumerate(SEASONS):
                crop = spec["crops"][i % len(spec["crops"])]
                row = ref[(ref.region == spec["region"]) & (ref.crop_type == crop) & (ref.year == year)]
                if row.empty:
                    continue
                r = row.iloc[0]
                s.add(FarmRecord(
                    farm_id=farm.id, year=year, crop_type=crop, area_ha=round(spec["area_ha"] * (0.6 if i % 2 else 0.4), 1),
                    yield_kg_ha=round(float(r.yield_kg_per_hectare), 1), rainfall_mm=float(r.rainfall_mm), temperature_c=round(float(r.temperature_c), 2),
                    pesticide_usage_ml=float(r.pesticide_usage_ml), fertilizer_type="Urea" if i % 2 else "NPK 15-15-15", irrigation_type=spec["irrigation_type"],
                ))
            print(f"farms: created {spec['name']}")


def main() -> None:
    reset = "--reset" in sys.argv
    started = time.perf_counter()
    loaded = seed_crop_records(reset)
    if loaded:
        seconds = time.perf_counter() - started
        print(f"crop_records: {loaded:,} rows in {seconds:.2f}s ({loaded / seconds:,.0f} rows/s)")
        try:
            record_seed_timing(seconds, loaded)
        except Exception as e:
            print(f"mongo: seed timing not recorded ({e})")
    seed_users()
    seed_farms(reset)
    try:
        mongo.ensure_indexes()
        print("mongo: indexes ensured")
    except Exception as e:
        print(f"mongo: skipped ({e})")
    seed_soil_cache()


SOIL_SNAPSHOT = os.path.join("datasets", "processed", "soilgrids_demo_farms.json")


def seed_soil_cache() -> None:
    """Pre-warms the SoilGrids cache for the demo farms so the demo never waits on the public API.
    Tries a live fetch first; if SoilGrids is slow or down, loads the saved snapshot of its real responses
    for the same coordinates (datasets/processed/soilgrids_demo_farms.json). Nothing here is synthetic."""
    import json
    from datetime import datetime, timedelta, timezone

    from backend.app.services import soil_real

    snapshot = {}
    if os.path.exists(SOIL_SNAPSHOT):
        with open(SOIL_SNAPSHOT, encoding="utf-8") as f:
            snapshot = json.load(f).get("points", {})
    for spec in DEMO_FARMS:
        key = f"{round(spec['latitude'], 3)},{round(spec['longitude'], 3)}"
        try:
            if mongo.cache_get("soilgrids_cache", key) is not None:
                print(f"soilgrids: {spec['name']} already cached")
                continue
            soil_real.fetch_soilgrids(spec["latitude"], spec["longitude"])
            print(f"soilgrids: {spec['name']} fetched live and cached")
        except soil_real.SoilGridsUnavailable as e:
            saved = snapshot.get(key)
            if not saved:
                print(f"soilgrids: {spec['name']} not cached ({e})")
                continue
            value = {k: v for k, v in saved.items() if k != "farm"}
            mongo.cache_set("soilgrids_cache", key, value, expires_at=datetime.now(timezone.utc) + timedelta(days=soil_real.CACHE_DAYS))
            print(f"soilgrids: {spec['name']} cached from the saved SoilGrids snapshot (fetched {saved.get('fetched_at')})")
        except Exception as e:  # Mongo down: the app still works, the first soil request just goes live
            print(f"soilgrids: skipped ({e})")
            return


def record_seed_timing(seconds: float, rows: int) -> None:
    """Stores the last seed's duration for the admin system metrics (data processing speed)."""
    from datetime import datetime, timezone

    from backend.app.db import mongo

    mongo.db().system_metrics.update_one(
        {"_id": "seed"},
        {"$set": {"seconds": round(seconds, 2), "crop_records": rows, "rows_per_sec": round(rows / seconds, 1) if seconds else None, "at": datetime.now(timezone.utc)}},
        upsert=True,
    )


if __name__ == "__main__":
    main()
