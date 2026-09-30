"""Regenerates datasets/processed/weather_analytics.json from the same scoring the API uses
(backend/app/services/weather_service.regional_weather_scores). Run from the repo root."""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.services import dataset  # noqa: E402
from backend.app.services.weather_service import regional_weather_scores  # noqa: E402

OUTPUT = os.path.join("datasets", "processed", "weather_analytics.json")


def run_weather_analytics():
    regions = dataset.regions()
    out = {
        "status_claim": "Dataset weather records",
        "data_source": "YieldSense dataset",
        "total_records_analyzed": int(len(dataset.get_df())),
        "available_regions": regions,
        "global": regional_weather_scores(None),
        "regional_breakdown": {r: regional_weather_scores(r) for r in regions},
    }
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {OUTPUT} ({len(regions)} regions)")


if __name__ == "__main__":
    run_weather_analytics()
