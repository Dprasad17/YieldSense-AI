"""Model registry and input-drift monitoring.

- Registry: models/registry.json lists every trained version with its data window, features and held-out
  metrics. scripts/train_models_v2.py appends an entry on each run; the served version is marked.
- Drift: the inputs of recent predictions (last 90 days) compared with the training data. Numeric inputs use
  the Population Stability Index (PSI, 10 quantile bins of the training data): < 0.1 stable, 0.1–0.25 watch,
  > 0.25 drifted. Categorical inputs report the share of predictions for crop/region pairs the training data
  doesn't have. Retraining is suggested when any input drifts or a new data year is available.
"""
import json
import os
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sqlalchemy import select

from backend.app.db.models import Prediction
from backend.app.db.session import session_scope
from backend.app.services import dataset
from backend.app.services.ml_service import load_card

REGISTRY_PATH = os.path.join("models", "registry.json")
NUMERIC = ["rainfall_mm", "temperature_C", "pesticide_usage_ml"]
MIN_PREDICTIONS = 30
WINDOW_DAYS = 90


def registry() -> list[dict]:
    try:
        with open(REGISTRY_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def psi(expected: np.ndarray, actual: np.ndarray, bins: int = 10) -> float:
    edges = np.unique(np.quantile(expected, np.linspace(0, 1, bins + 1)))
    if len(edges) < 3:
        return 0.0
    edges[0], edges[-1] = -np.inf, np.inf
    e = np.histogram(expected, edges)[0] / len(expected)
    a = np.histogram(actual, edges)[0] / len(actual)
    e, a = np.clip(e, 1e-4, None), np.clip(a, 1e-4, None)
    return float(np.sum((a - e) * np.log(a / e)))


def _level(value: float) -> str:
    return "stable" if value < 0.1 else "watch" if value < 0.25 else "drifted"


def drift() -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)
    with session_scope() as s:
        rows = s.scalars(select(Prediction.inputs).where(Prediction.created_at >= since)).all()
    recent = pd.DataFrame([r for r in rows if isinstance(r, dict)])
    out: dict = {"window_days": WINDOW_DAYS, "predictions": int(len(recent)), "min_predictions": MIN_PREDICTIONS, "features": [], "status": "not_enough_data"}
    if len(recent) < MIN_PREDICTIONS:
        return out
    train = dataset.get_df()
    worst = "stable"
    for col in NUMERIC:
        if col not in recent:
            continue
        actual = pd.to_numeric(recent[col], errors="coerce").dropna().to_numpy()
        if len(actual) < MIN_PREDICTIONS:
            continue
        value = psi(train[col].dropna().to_numpy(), actual)
        level = _level(value)
        worst = max(worst, level, key=["stable", "watch", "drifted"].index)
        out["features"].append({"feature": col, "psi": round(value, 3), "level": level, "train_median": round(float(train[col].median()), 1), "recent_median": round(float(np.median(actual)), 1)})
    if {"region", "crop_type"} <= set(recent.columns):
        known = set(zip(train["region"], train["crop_type"]))
        unseen = float(np.mean([(r, c) not in known for r, c in zip(recent["region"], recent["crop_type"])]))
        level = "stable" if unseen < 0.05 else "watch" if unseen < 0.2 else "drifted"
        worst = max(worst, level, key=["stable", "watch", "drifted"].index)
        out["features"].append({"feature": "crop × region", "unseen_share": round(unseen, 3), "level": level})
    out["status"] = worst
    return out


def report() -> dict:
    card = load_card()
    versions = registry()
    served = card.get("version")
    for v in versions:
        v["served"] = v.get("version") == served
    d = drift()
    last_year = dataset.year_range()[1]
    trained_through = max((v.get("data_last_year") or 0 for v in versions if v.get("served")), default=0)
    reasons = []
    if d["status"] == "drifted":
        reasons.append("Recent prediction inputs differ from the training data (PSI > 0.25).")
    if trained_through and last_year > trained_through:
        reasons.append(f"The crop records now include {last_year}, after the model's last training year ({trained_through}).")
    return {
        "served_version": served,
        "registry": versions,
        "drift": d,
        "retrain_recommended": bool(reasons),
        "reasons": reasons,
        "retraining": "Run the 'Retrain model' GitHub Actions workflow (or scripts/train_models_v2.py then scripts/validate_model.py); "
        "the validation gate must pass before the new model is committed.",
    }
