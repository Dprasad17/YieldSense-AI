"""
Serves the v2 yield model (models/v2, trained by scripts/train_models_v2.py).

The bundle carries its own preprocessing pipeline, the feature list and the split-conformal
interval residuals; model_card.json holds the evaluation of every model on every split.
Only the model's features drive the prediction. Field conditions (soil, humidity, sunlight,
irrigation, fertilizer, disease) are optional and feed the risk flags, not the model.
"""
import json
import os
import time
from collections import deque
from functools import lru_cache
from threading import Lock
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd

from backend.app.core import agronomy_rules
from backend.app.core.config import settings
from backend.app.core.observability import log

MODEL_PATH = os.path.join(settings.MODEL_DIR, "model.pkl")
CARD_PATH = os.path.join(settings.MODEL_DIR, "model_card.json")

# Field conditions accepted alongside the model inputs; used for risk flags and insights only.
FIELD_CONDITIONS = [
    "irrigation_type",
    "fertilizer_type",
    "crop_disease_status",
    "soil_pH",
    "soil_moisture_%",
    "humidity_%",
    "sunlight_hours",
]


@lru_cache(maxsize=1)
def load_card() -> dict:
    if not os.path.exists(CARD_PATH):
        return {}
    with open(CARD_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def active_model_summary() -> Optional[dict]:
    card = load_card()
    sel = card.get("selected")
    if not sel:
        return None
    m = sel["metrics"]
    return {
        "name": sel["model"],
        "version": card.get("version"),
        "target": sel.get("target"),
        "split": sel.get("split"),
        "r2": m.get("r2"),
        "rmse": m.get("rmse"),
        "mae": m.get("mae"),
        "mape": m.get("mape"),
        "interval_coverage": m.get("interval_coverage"),
        "inference_latency_ms": m.get("latency_p50_ms"),
        "test_size": m.get("test_rows"),
    }


class LatencyTracker:
    """Rolling window of single-call inference times (ms) for the admin system metrics."""

    def __init__(self, size: int = 2000):
        self._values: deque[float] = deque(maxlen=size)
        self._lock = Lock()

    def add(self, ms: float) -> None:
        with self._lock:
            self._values.append(ms)

    def summary(self) -> dict:
        with self._lock:
            values = list(self._values)
        if not values:
            return {"count": 0, "p50_ms": None, "p95_ms": None}
        return {
            "count": len(values),
            "p50_ms": round(float(np.percentile(values, 50)), 2),
            "p95_ms": round(float(np.percentile(values, 95)), 2),
        }


class MLService:
    def __init__(self):
        self.bundle: Optional[dict] = None
        self.latency = LatencyTracker()
        self._load_artifacts()

    def _load_artifacts(self) -> None:
        if not os.path.exists(MODEL_PATH):
            log.error(f"[MLService] {MODEL_PATH} not found. Run scripts/train_models_v2.py first.")
            return
        try:
            self.bundle = joblib.load(MODEL_PATH)
            log.info(f"[MLService] Loaded {MODEL_PATH} ({self.bundle['model']}, target {self.bundle['target']})")
        except Exception as e:  # corrupt or incompatible pickle: serve 503s instead of crashing
            log.error(f"[MLService] Error loading {MODEL_PATH}: {e}")
            self.bundle = None

    def is_ready(self) -> bool:
        return self.bundle is not None

    def _ensure_ready(self) -> dict:
        if self.bundle is None:
            self._load_artifacts()
        if self.bundle is None:
            raise RuntimeError("Yield model is not available. Train it with scripts/train_models_v2.py.")
        return self.bundle

    @property
    def features(self) -> list[str]:
        return list(self._ensure_ready()["features"])

    @property
    def name(self) -> str:
        return str(self._ensure_ready()["model"])

    def _with_history(self, frame: pd.DataFrame) -> pd.DataFrame:
        """Fills the yield-history inputs (v3 models) from the crop records when the caller didn't give them."""
        from backend.app.services import history_features

        if any(f in history_features.LAG_FEATURES for f in self._ensure_ready()["features"]):
            return history_features.fill(frame)
        return frame

    def history_inputs(self, payload: dict) -> dict:
        """The yield-history values a prediction used (given or looked up), for display."""
        from backend.app.services import history_features

        if not any(f in history_features.LAG_FEATURES for f in self.features):
            return {}
        row = self._with_history(pd.DataFrame([{k: payload.get(k) for k in ("region", "crop_type", "year", *history_features.LAG_FEATURES)}]))
        return {k: (None if pd.isna(row.iloc[0][k]) else round(float(row.iloc[0][k]), 1)) for k in history_features.LAG_FEATURES}

    def predict_frame(self, frame: pd.DataFrame) -> np.ndarray:
        """Point predictions (kg/ha) for many rows."""
        b = self._ensure_ready()
        frame = self._with_history(frame)
        pred = np.asarray(b["pipeline"].predict(frame[b["features"]]), dtype=float)
        if b["target"] == "log1p":
            pred = np.expm1(pred)
        return np.clip(pred, 0.0, None)

    def interval(self, point: np.ndarray | float) -> tuple[Any, Any]:
        """P10–P90 band: point + the 10th/90th percentile residuals of the out-of-time test period."""
        b = self._ensure_ready()
        p = np.asarray(point, dtype=float)
        if b["target"] == "log1p":
            lo, hi = np.expm1(np.log1p(p) + b["residual_q10"]), np.expm1(np.log1p(p) + b["residual_q90"])
        else:
            lo, hi = p + b["residual_q10"], p + b["residual_q90"]
        return np.clip(lo, 0.0, None), np.clip(hi, 0.0, None)

    def explain(self, payload: dict) -> Optional[dict]:
        """Exact per-feature contributions (TreeSHAP, computed by XGBoost itself) for one prediction.

        The one-hot columns of a categorical input are summed back into that input, so the result has one
        entry per model feature. base + Σ contributions = the model's raw output. For a log1p target the
        contributions are in log space and are reported as approximate % changes instead of kg/ha."""
        b = self._ensure_ready()
        pipe = b["pipeline"]
        estimator = pipe[-1]
        if not hasattr(estimator, "get_booster"):
            return None
        import xgboost as xgb

        features: list[str] = [str(f) for f in b["features"]]
        frame = self._with_history(pd.DataFrame([{f: payload.get(f) for f in features}]))
        prep = pipe[:-1]
        X = np.asarray(prep.transform(frame[features]), dtype=float)
        names = [str(n) for n in prep.get_feature_names_out()]
        contribs = estimator.get_booster().predict(xgb.DMatrix(X, feature_names=None), pred_contribs=True)[0]
        totals: dict[str, float] = {f: 0.0 for f in features}
        for name, value in zip(names, contribs[:-1]):
            raw = name.split("__", 1)[-1].removeprefix("missingindicator_")
            owner = next((f for f in sorted(features, key=len, reverse=True) if raw == f or raw.startswith(f + "_")), None)
            if owner:
                totals[owner] += float(value)
        base = float(contribs[-1])
        log_target = b["target"] == "log1p"
        items = []
        for f in features:
            v = totals[f]
            items.append(
                {
                    "feature": f,
                    "value": None if pd.isna(frame.iloc[0][f]) else (frame.iloc[0][f].item() if hasattr(frame.iloc[0][f], "item") else frame.iloc[0][f]),
                    "contribution_kg_ha": None if log_target else round(v, 1),
                    "contribution_pct": round((np.expm1(v)) * 100, 1) if log_target else None,
                }
            )
        items.sort(key=lambda r: -abs(r["contribution_kg_ha"] if r["contribution_kg_ha"] is not None else r["contribution_pct"]))
        return {
            "method": "TreeSHAP contributions from XGBoost (pred_contribs); one-hot columns summed per input",
            "base_kg_ha": round(float(np.expm1(base)) if log_target else base, 1),
            "unit": "percent" if log_target else "kg/ha",
            "contributions": items,
        }

    def predict_yield(self, payload: dict) -> dict:
        from backend.app.services.history_features import LAG_FEATURES

        features = self.features
        missing = [f for f in features if payload.get(f) is None and f not in LAG_FEATURES]
        if missing:
            raise ValueError(f"Missing required model inputs: {missing}")

        frame = pd.DataFrame([{f: payload.get(f) for f in features}])
        started = time.perf_counter()
        point = float(self.predict_frame(frame)[0])
        self.latency.add((time.perf_counter() - started) * 1000)
        low, high = (float(v) for v in self.interval(point))

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
