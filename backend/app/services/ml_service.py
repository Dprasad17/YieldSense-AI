import json
import os
from functools import lru_cache
from typing import Optional

import joblib
import numpy as np
import pandas as pd

from backend.app.core import agronomy_rules

MODELS_DIR = "models"
BEST_MODEL_PATH = os.path.join(MODELS_DIR, "best_model.pkl")
PREPROCESSOR_PATH = os.path.join(MODELS_DIR, "preprocessor.pkl")
METRICS_PATH = os.path.join(MODELS_DIR, "model_performance_metrics.json")

FEATURE_ORDER = [
    "crop_type",
    "region",
    "irrigation_type",
    "fertilizer_type",
    "crop_disease_status",
    "soil_pH",
    "soil_moisture_%",
    "temperature_C",
    "rainfall_mm",
    "humidity_%",
    "sunlight_hours",
    "pesticide_usage_ml",
    "total_days",
    "NDVI_index",
]

# Prediction interval: P10–P90 of the individual trees' predictions.
INTERVAL_LOW_Q = 10
INTERVAL_HIGH_Q = 90


@lru_cache(maxsize=1)
def load_metrics() -> dict:
    if not os.path.exists(METRICS_PATH):
        return {}
    with open(METRICS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def active_model_summary() -> Optional[dict]:
    data = load_metrics()
    name = data.get("best_model")
    m = data.get(name) if name else None
    if not m:
        return None
    return {
        "name": name,
        "r2": m.get("r2"),
        "rmse": m.get("rmse"),
        "mae": m.get("mae"),
        "inference_latency_ms": m.get("inference_latency_ms"),
        "test_size": data.get("metadata", {}).get("test_size"),
    }


def _model_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Matches the training encoding: pandas read the dataset's "None" disease status as NaN,
    so the fitted encoder knows NaN (not the string "None") as the no-disease category."""
    out = frame[FEATURE_ORDER].copy()
    status = out["crop_disease_status"].astype(object)
    out["crop_disease_status"] = status.where(~status.isin(["None", "none", ""]), np.nan)
    return out


class MLService:
    def __init__(self):
        self.model = None
        self.preprocessor = None
        self._load_artifacts()

    def _load_artifacts(self):
        if os.path.exists(BEST_MODEL_PATH) and os.path.exists(PREPROCESSOR_PATH):
            try:
                self.model = joblib.load(BEST_MODEL_PATH)
                self.preprocessor = joblib.load(PREPROCESSOR_PATH)
                print("[MLService] Loaded best_model.pkl and preprocessor.pkl")
            except Exception as e:
                print(f"[MLService] Error loading artifacts: {e}")
                self.model = None
                self.preprocessor = None
        else:
            print("[MLService] Artifacts not found. Run scripts/train_models.py first.")

    def is_ready(self) -> bool:
        return self.model is not None and self.preprocessor is not None

    def _ensure_ready(self):
        if not self.is_ready():
            self._load_artifacts()
        if self.model is None or self.preprocessor is None:
            raise RuntimeError("ML model artifacts missing. Please train the models first.")
        return self.model, self.preprocessor

    def tree_predictions(self, frame: pd.DataFrame) -> np.ndarray:
        """(n_trees, n_rows) matrix of per-tree predictions; one row when the model isn't an ensemble."""
        model, preprocessor = self._ensure_ready()
        X = preprocessor.transform(_model_frame(frame))
        trees = getattr(model, "estimators_", None)
        if trees is not None and len(trees) > 1:
            return np.vstack([t.predict(X) for t in trees])
        return np.asarray(model.predict(X), dtype=float)[None, :]

    def predict_frame(self, frame: pd.DataFrame) -> np.ndarray:
        """Point predictions for many rows (mean of trees, like the model itself)."""
        model, preprocessor = self._ensure_ready()
        X = preprocessor.transform(_model_frame(frame))
        return np.asarray(model.predict(X), dtype=float)

    def predict_yield(self, payload: dict) -> dict:
        missing = [f for f in FEATURE_ORDER if f not in payload]
        if missing:
            raise ValueError(f"Missing required input features: {missing}")

        frame = pd.DataFrame([payload])[FEATURE_ORDER]
        per_tree = self.tree_predictions(frame)[:, 0]
        point = max(0.0, float(self.predict_frame(frame)[0]))
        low = max(0.0, float(np.percentile(per_tree, INTERVAL_LOW_Q)))
        high = max(0.0, float(np.percentile(per_tree, INTERVAL_HIGH_Q)))

        crop = str(payload["crop_type"])
        flags = agronomy_rules.input_risk_flags(crop, payload)
        return {
            "predicted_yield_kg_ha": round(point, 2),
            "low_kg_ha": round(min(low, point), 2),
            "high_kg_ha": round(max(high, point), 2),
            "productivity_rating": agronomy_rules.productivity_rating(crop, point),
            "risk_rating": agronomy_rules.risk_rating_from_flags(flags),
            "risk_flags": flags,
        }


ml_service = MLService()
