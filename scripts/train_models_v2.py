"""
Leakage-free yield model training (Milestone 2).

- Features: only real FAOSTAT columns (crop, region, year, rainfall, temperature, pesticides).
  Synthetic columns are tested with permutation importance and kept only if they carry real signal.
  NDVI is excluded: it was generated from the yield's own rank (target leakage).
- Targets: raw yield and log1p(yield).
- Splits: random 80/20, temporal (train <= 2008, test 2009-2013, the primary split),
  and unseen regions (20% of regions held out).
- Models: Linear, Ridge, Random Forest, XGBoost, LightGBM, Keras MLP.
- Metrics: MAE, RMSE, R2, MAPE, single-row latency p50/p95, P10-P90 interval coverage
  (split-conformal: residual quantiles from a calibration slice of the training data).
- Output: models/v2/model.pkl (serving pipeline + interval residuals) and models/v2/model_card.json.

Run from the repo root:  python scripts/train_models_v2.py
"""
import json
import os
import sys
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBRegressor

SEED = 42
DATA = os.path.join("datasets", "processed", "cleaned_crop_yield.csv")
OUT_DIR = os.path.join("models", "v2")
OLD_METRICS = os.path.join("models", "model_performance_metrics.json")

REAL_CAT = ["crop_type", "region"]
REAL_NUM = ["year", "rainfall_mm", "temperature_C", "pesticide_usage_ml"]
SYNTH_CAT = ["irrigation_type", "fertilizer_type", "crop_disease_status"]
SYNTH_NUM = ["soil_pH", "soil_moisture_%", "humidity_%", "sunlight_hours", "total_days"]
# Synthetic columns that only re-encode another input: preprocess_real_dataset.py sets total_days to a
# fixed per-crop base (e.g. Wheat 140, Cassava 270) plus uniform noise of ±10 days, so it is a crop proxy,
# not a measured growing period. Excluded regardless of permutation importance.
PROXY_COLUMNS = {"total_days": "Synthetic crop proxy: a fixed per-crop base duration plus ±10 random days (scripts/preprocess_real_dataset.py). It re-encodes crop_type and was not measured."}
VERSION = "2.1.0"
PREVIOUS_CARD = os.path.join("models", "v2", "model_card.json")
TARGET = "yield_kg_per_hectare"
TEMPORAL_CUTOFF = 2008


def load() -> pd.DataFrame:
    df = pd.read_csv(DATA)
    df["year"] = pd.to_datetime(df["sowing_date"]).dt.year
    df["crop_disease_status"] = df["crop_disease_status"].fillna("None")
    return df


def preprocessor(cat, num) -> ColumnTransformer:
    return ColumnTransformer(
        [
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat),
            ("num", StandardScaler(), num),
        ]
    )


def make_models():
    return {
        "Linear Regression": lambda: LinearRegression(),
        "Ridge Regression": lambda: Ridge(alpha=1.0),
        "Random Forest": lambda: RandomForestRegressor(n_estimators=200, min_samples_leaf=2, n_jobs=-1, random_state=SEED),
        "XGBoost": lambda: XGBRegressor(n_estimators=600, learning_rate=0.05, max_depth=8, subsample=0.8, colsample_bytree=0.8, random_state=SEED, n_jobs=-1),
        "LightGBM": lambda: LGBMRegressor(n_estimators=800, learning_rate=0.05, num_leaves=63, subsample=0.8, colsample_bytree=0.8, random_state=SEED, verbose=-1),
        "Keras MLP": lambda: KerasMLP(),
    }


class KerasMLP(RegressorMixin, BaseEstimator):
    """Small TensorFlow/Keras MLP with an sklearn estimator interface."""

    def __init__(self, epochs: int = 60):
        self.epochs = epochs

    def fit(self, X, y):
        import tensorflow as tf

        tf.keras.utils.set_random_seed(SEED)
        self.y_mean_, self.y_std_ = float(np.mean(y)), float(np.std(y) or 1.0)
        yn = (np.asarray(y) - self.y_mean_) / self.y_std_
        m = tf.keras.Sequential(
            [
                tf.keras.layers.Input(shape=(X.shape[1],)),
                tf.keras.layers.Dense(128, activation="relu"),
                tf.keras.layers.Dropout(0.1),
                tf.keras.layers.Dense(64, activation="relu"),
                tf.keras.layers.Dense(1),
            ]
        )
        m.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="mse")
        m.fit(
            np.asarray(X, dtype="float32"),
            yn,
            epochs=self.epochs,
            batch_size=256,
            validation_split=0.1,
            verbose=0,
            callbacks=[tf.keras.callbacks.EarlyStopping(patience=6, restore_best_weights=True)],
        )
        self.model_ = m
        return self

    def predict(self, X):
        out = self.model_.predict(np.asarray(X, dtype="float32"), verbose=0).ravel()
        return out * self.y_std_ + self.y_mean_


def splits(df: pd.DataFrame):
    idx = np.arange(len(df))
    tr, te = train_test_split(idx, test_size=0.2, random_state=SEED)
    yield "random", "Random 80/20", tr, te
    tr = idx[df["year"].to_numpy() <= TEMPORAL_CUTOFF]
    te = idx[df["year"].to_numpy() > TEMPORAL_CUTOFF]
    yield "temporal", f"Train ≤ {TEMPORAL_CUTOFF}, test {TEMPORAL_CUTOFF + 1}–{int(df['year'].max())}", tr, te
    gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED)
    tr, te = next(gss.split(idx, groups=df["region"]))
    yield "unseen_region", "20% of regions held out entirely", tr, te


def fwd(y, target):
    return np.log1p(y) if target == "log1p" else y


def inv(y, target):
    return np.expm1(y) if target == "log1p" else y


def evaluate(df, cat, num, name, factory, target, tr, te):
    X = df[cat + num]
    y = df[TARGET].to_numpy()
    # Calibration slice inside the training data for split-conformal intervals.
    fit_idx, cal_idx = train_test_split(tr, test_size=0.15, random_state=SEED)
    pipe = Pipeline([("prep", preprocessor(cat, num)), ("model", factory())])
    pipe.fit(X.iloc[fit_idx], fwd(y[fit_idx], target))
    cal_res = fwd(y[cal_idx], target) - pipe.predict(X.iloc[cal_idx])
    q10, q90 = np.quantile(cal_res, [0.10, 0.90])

    pred_t = pipe.predict(X.iloc[te])
    pred = np.maximum(inv(pred_t, target), 0)
    lo = np.maximum(inv(pred_t + q10, target), 0)
    hi = np.maximum(inv(pred_t + q90, target), 0)
    yt = y[te]

    sample = X.iloc[te].iloc[: min(200, len(te))]
    times = []
    for i in range(len(sample)):
        t0 = time.perf_counter()
        pipe.predict(sample.iloc[[i]])
        times.append((time.perf_counter() - t0) * 1000)

    return pipe, {
        "model": name,
        "target": target,
        "mae": round(float(mean_absolute_error(yt, pred)), 2),
        "rmse": round(float(np.sqrt(mean_squared_error(yt, pred))), 2),
        "r2": round(float(r2_score(yt, pred)), 4),
        "mape": round(float(np.mean(np.abs(yt - pred) / np.maximum(yt, 1.0)) * 100), 2),
        "latency_p50_ms": round(float(np.percentile(times, 50)), 3),
        "latency_p95_ms": round(float(np.percentile(times, 95)), 3),
        "interval_coverage": round(float(np.mean((yt >= lo) & (yt <= hi))), 4),
        "train_rows": int(len(tr)),
        "test_rows": int(len(te)),
    }


def heldout_interval(df, cat, num, name, factory, target):
    """Train on <= 2008, calibrate the P10-P90 residuals on 2009-2010, evaluate on 2011-2013 (never used to calibrate)."""
    years = df["year"].to_numpy()
    tr, cal, ev = (np.where(m)[0] for m in (years <= TEMPORAL_CUTOFF, (years > TEMPORAL_CUTOFF) & (years <= 2010), years > 2010))
    X, y = df[cat + num], df[TARGET].to_numpy()
    pipe = Pipeline([("prep", preprocessor(cat, num)), ("model", factory())])
    pipe.fit(X.iloc[tr], fwd(y[tr], target))
    q10, q90 = np.quantile(fwd(y[cal], target) - pipe.predict(X.iloc[cal]), [0.10, 0.90])
    p = pipe.predict(X.iloc[ev])
    lo, hi = np.maximum(inv(p + q10, target), 0), np.maximum(inv(p + q90, target), 0)
    yt = y[ev]
    return {
        "method": "Train on 1990-2008, calibrate P10/P90 residuals on 2009-2010, evaluate on 2011-2013",
        "calibration_rows": int(len(cal)),
        "evaluation_rows": int(len(ev)),
        "coverage": round(float(np.mean((yt >= lo) & (yt <= hi))), 4),
        "nominal": 0.8,
        "mean_width_kg_ha": round(float(np.mean(hi - lo)), 1),
        "median_width_kg_ha": round(float(np.median(hi - lo)), 1),
    }


def weather_ablation(df, cat, num, name, factory, target, tr, te):
    """Temporal-split RMSE/R² with and without the weather inputs (the served model's family and target)."""
    out = []
    for label, drop in (("all features", []), ("without temperature", ["temperature_C"]), ("without rainfall", ["rainfall_mm"]), ("without temperature and rainfall", ["temperature_C", "rainfall_mm"])):
        n2 = [c for c in num if c not in drop]
        _, m = evaluate(df, cat, n2, name, factory, target, tr, te)
        out.append({"variant": label, "dropped": drop, "rmse": m["rmse"], "r2": m["r2"], "mae": m["mae"]})
    base = out[0]
    for r in out:
        r["delta_rmse"] = round(r["rmse"] - base["rmse"], 2)
        r["delta_r2"] = round(r["r2"] - base["r2"], 4)
    return out


def permutation_check(df):
    """Does any synthetic column add real signal on the temporal split? RF with all candidates."""
    cat, num = REAL_CAT + SYNTH_CAT, REAL_NUM + SYNTH_NUM
    X, y = df[cat + num], df[TARGET].to_numpy()
    tr = df["year"] <= TEMPORAL_CUTOFF
    pipe = Pipeline([("prep", preprocessor(cat, num)), ("model", RandomForestRegressor(n_estimators=150, min_samples_leaf=2, n_jobs=-1, random_state=SEED))])
    pipe.fit(X[tr], np.log1p(y[tr]))
    res = permutation_importance(pipe, X[~tr], np.log1p(y[~tr]), n_repeats=5, random_state=SEED, n_jobs=1)
    out = []
    for col, m, s in zip(cat + num, res.importances_mean, res.importances_std):
        synthetic = col in SYNTH_CAT + SYNTH_NUM
        keep = (not synthetic) or (col not in PROXY_COLUMNS and m > 0.005 and m > 2 * s)
        out.append({"feature": col, "importance": round(float(m), 5), "std": round(float(s), 5), "synthetic": synthetic, "kept": bool(keep)})
    return sorted(out, key=lambda r: -r["importance"])


def main():
    df = load()
    print(f"[1/4] {len(df):,} rows, years {df['year'].min()}–{df['year'].max()}")

    print("[2/4] Permutation importance for synthetic columns (temporal split, log1p target)…")
    importance = permutation_check(df)
    kept_synth = [r["feature"] for r in importance if r["synthetic"] and r["kept"]]
    cat = REAL_CAT + [c for c in SYNTH_CAT if c in kept_synth]
    num = REAL_NUM + [c for c in SYNTH_NUM if c in kept_synth]
    print(f"      kept synthetic: {kept_synth or 'none'}")

    print("[3/4] Evaluating models × targets × splits…")
    results, split_defs = [], {}
    models = make_models()
    for key, desc, tr, te in splits(df):
        split_defs[key] = desc
        for name, factory in models.items():
            for target in ("raw", "log1p"):
                t0 = time.time()
                _, m = evaluate(df, cat, num, name, factory, target, tr, te)
                m["split"] = key
                results.append(m)
                print(f"      {key:14s} {name:18s} {target:5s} R2={m['r2']:.3f} RMSE={m['rmse']:,.0f} cov={m['interval_coverage']:.2f} ({time.time() - t0:.0f}s)")

    # Selection: lowest temporal RMSE among models that can be served without TensorFlow at runtime.
    # Models within 1% of the lowest temporal RMSE are treated as tied; the lower p95 latency wins
    # (smaller, faster artifact for serving).
    temporal = [r for r in results if r["split"] == "temporal" and r["model"] != "Keras MLP"]
    floor = min(r["rmse"] for r in temporal)
    tied = [r for r in temporal if r["rmse"] <= floor * 1.01]
    best = min(tied, key=lambda r: (r["latency_p95_ms"], r["rmse"]))
    print(f"[4/4] Selected {best['model']} ({best['target']}) on the temporal split; refitting on all data…")

    tr = df.index[df["year"] <= TEMPORAL_CUTOFF].to_numpy()
    te = df.index[df["year"] > TEMPORAL_CUTOFF].to_numpy()
    # Interval residuals come from the out-of-time test period (honest for future years).
    tmp, _ = evaluate(df, cat, num, best["model"], models[best["model"]], best["target"], tr, te)
    heldout = heldout_interval(df, cat, num, best["model"], models[best["model"]], best["target"])
    print(f"      held-out interval coverage {heldout['coverage']:.3f}, mean width {heldout['mean_width_kg_ha']:,.0f} kg/ha")
    ablation = weather_ablation(df, cat, num, best["model"], models[best["model"]], best["target"], tr, te)
    for a in ablation:
        print(f"      ablation {a['variant']:34s} RMSE={a['rmse']:,.0f} (d{a['delta_rmse']:+,.0f}) R2={a['r2']:.4f} (d{a['delta_r2']:+.4f})")
    previous = {}
    if os.path.exists(PREVIOUS_CARD):
        with open(PREVIOUS_CARD, encoding="utf-8") as f:
            pc = json.load(f)
        if pc.get("version") != VERSION:
            previous = {"version": pc.get("version"), "features": pc.get("features"), "selected": pc.get("selected")}
    res = fwd(df[TARGET].to_numpy()[te], best["target"]) - tmp.predict(df[cat + num].iloc[te])
    q10, q90 = (float(v) for v in np.quantile(res, [0.10, 0.90]))
    final = Pipeline([("prep", preprocessor(cat, num)), ("model", models[best["model"]]())])
    final.fit(df[cat + num], fwd(df[TARGET].to_numpy(), best["target"]))

    os.makedirs(OUT_DIR, exist_ok=True)
    joblib.dump(
        {"pipeline": final, "target": best["target"], "features": cat + num, "categorical": cat, "numeric": num, "residual_q10": q10, "residual_q90": q90, "model": best["model"]},
        os.path.join(OUT_DIR, "model.pkl"),
        compress=3,
    )

    old = {}
    if os.path.exists(OLD_METRICS):
        with open(OLD_METRICS, encoding="utf-8") as f:
            o = json.load(f)
        bm = o.get("best_model")
        if bm and bm in o:
            old = {"model": bm, "r2": o[bm]["r2"], "rmse": o[bm]["rmse"], "mae": o[bm]["mae"], "note": "Previous model used NDVI, which was generated from the yield itself (target leakage), on a random split."}

    card = {
        "name": f"YieldSense yield model v2 · {best['model']}",
        "version": VERSION,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "selected": {"model": best["model"], "target": best["target"], "split": "temporal", "metrics": best},
        "selection_rule": "Lowest RMSE on the temporal split (train ≤ 2008, test 2009–2013); models within 1% of the lowest RMSE are tied and the one with the lower p95 latency is served. The Keras MLP is evaluated but not served (it would add TensorFlow to the API runtime).",
        "features": {"categorical": cat, "numeric": num},
        "excluded_features": [
            {"feature": "NDVI_index", "reason": "Derived from the yield's own percentile rank during preprocessing (target leakage)."},
            *[{"feature": c, "reason": r} for c, r in PROXY_COLUMNS.items()],
            *[{"feature": r["feature"], "reason": f"Synthetic column without measurable signal (permutation importance {r['importance']:.4f} ± {r['std']:.4f})."} for r in importance if r["synthetic"] and not r["kept"] and r["feature"] not in PROXY_COLUMNS],
        ],
        "permutation_importance": importance,
        "splits": split_defs,
        "results": results,
        "interval": {"method": "Split-conformal: 10th and 90th percentiles of residuals on the out-of-time test period", "space": best["target"], "residual_q10": q10, "residual_q90": q90, "heldout": heldout},
        "weather_ablation": {
            "split": "temporal",
            "model": best["model"],
            "target": best["target"],
            "note": "Rainfall in this dataset is one long-term average per country (constant across years), so its effect is a cross-country association, not a year-to-year weather effect. Temperature varies by year.",
            "results": ablation,
        },
        "previous_version": previous,
        "data": {"rows": int(len(df)), "years": [int(df["year"].min()), int(df["year"].max())], "regions": int(df["region"].nunique()), "crops": int(df["crop_type"].nunique())},
        "previous_model": old,
        "intended_use": "Country-level yield expectations per crop and year for planning and comparison.",
        "limitations": [
            "Trained on country-level FAOSTAT yields, not individual fields.",
            "Soil, humidity, sunlight, irrigation, fertilizer, disease and crop-duration columns in the dataset are synthetic and are not used by the model.",
            "Rainfall is a constant long-term average per country, so the model cannot learn a year-to-year rainfall effect.",
            "Tree models do not extrapolate trends beyond the last training year.",
        ],
    }
    with open(os.path.join(OUT_DIR, "model_card.json"), "w", encoding="utf-8") as f:
        json.dump(card, f, indent=2, ensure_ascii=False)
    print(f"Saved {OUT_DIR}/model.pkl and model_card.json")


if __name__ == "__main__":
    sys.exit(main())
