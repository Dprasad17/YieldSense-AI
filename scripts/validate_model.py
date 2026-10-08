"""
Model validation gate (Milestone 4). Fails (exit code 1) when the served model does not meet its targets.

Checks, all on data the check itself controls:
  1. Integrity: the bundle loads, its features match the model card, no excluded column is used.
  2. Out-of-time accuracy: a clone of the served pipeline is refitted on 1990-2008 and scored on 2009-2013.
  3. Interval: P10-P90 residuals calibrated on 2009-2010 must cover enough of 2011-2013.
  4. Sanity: predictions are finite and non-negative for every crop; same input gives the same output.
  5. Latency: single-row predictions of the served bundle (p95).

    python scripts/validate_model.py            # prints a report, exit code 0/1
    python scripts/validate_model.py --json out.json
"""
import argparse
import json
import os
import sys
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODEL = os.path.join(ROOT, "models", "v2", "model.pkl")
CARD = os.path.join(ROOT, "models", "v2", "model_card.json")
DATA = os.path.join(ROOT, "datasets", "processed", "cleaned_crop_yield.csv")
TARGET = "yield_kg_per_hectare"
CUTOFF = 2008

# Acceptance thresholds. Set a little below the trained results so ordinary retraining noise passes,
# while a real regression (leakage removed badly, wrong features, broken pipeline) fails.
THRESHOLDS = {
    "temporal_r2_min": 0.94,
    "temporal_rmse_max": 2300.0,
    "temporal_mae_max": 1300.0,
    "interval_coverage_min": 0.70,
    "latency_p95_ms_max": 50.0,
}
FORBIDDEN_FEATURES = {"NDVI_index", "total_days", "soil_pH", "soil_moisture_%", "humidity_%", "sunlight_hours",
                      "irrigation_type", "fertilizer_type", "crop_disease_status"}


def load_data() -> pd.DataFrame:
    df = pd.read_csv(DATA)
    df["year"] = pd.to_datetime(df["sowing_date"]).dt.year
    return df


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="write the report to this file")
    args = ap.parse_args()

    bundle = joblib.load(MODEL)
    with open(CARD, encoding="utf-8") as f:
        card = json.load(f)
    feats = list(bundle["features"])
    checks: list[dict] = []

    def check(name: str, ok: bool, detail: str) -> None:
        checks.append({"check": name, "passed": bool(ok), "detail": detail})

    # 1. integrity
    card_feats = card["features"]["categorical"] + card["features"]["numeric"]
    check("features match the model card", feats == card_feats, f"bundle {feats}")
    check("no excluded or synthetic column used", not (set(feats) & FORBIDDEN_FEATURES), f"overlap {sorted(set(feats) & FORBIDDEN_FEATURES)}")

    # 2. out-of-time accuracy with a fresh clone of the served pipeline
    df = load_data()
    train, test = df[df["year"] <= CUTOFF], df[df["year"] > CUTOFF]
    target = bundle["target"]
    fwd = (lambda y: np.log1p(y)) if target == "log1p" else (lambda y: y)
    inv = (lambda y: np.expm1(y)) if target == "log1p" else (lambda y: y)
    pipe = clone(bundle["pipeline"]).fit(train[feats], fwd(train[TARGET].to_numpy()))
    pred = np.maximum(inv(pipe.predict(test[feats])), 0)
    yt = test[TARGET].to_numpy()
    r2 = float(r2_score(yt, pred))
    rmse = float(np.sqrt(mean_squared_error(yt, pred)))
    mae = float(mean_absolute_error(yt, pred))
    check("temporal R²", r2 >= THRESHOLDS["temporal_r2_min"], f"{r2:.4f} (min {THRESHOLDS['temporal_r2_min']})")
    check("temporal RMSE", rmse <= THRESHOLDS["temporal_rmse_max"], f"{rmse:,.1f} kg/ha (max {THRESHOLDS['temporal_rmse_max']:,.0f})")
    check("temporal MAE", mae <= THRESHOLDS["temporal_mae_max"], f"{mae:,.1f} kg/ha (max {THRESHOLDS['temporal_mae_max']:,.0f})")

    # 3. interval: calibrate on 2009-2010, evaluate on 2011-2013
    years = test["year"].to_numpy()
    cal, ev = years <= 2010, years > 2010
    res = fwd(yt[cal]) - pipe.predict(test[feats][cal])
    q10, q90 = np.quantile(res, [0.10, 0.90])
    p_ev = pipe.predict(test[feats][ev])
    lo, hi = np.maximum(inv(p_ev + q10), 0), np.maximum(inv(p_ev + q90), 0)
    coverage = float(np.mean((yt[ev] >= lo) & (yt[ev] <= hi)))
    check("P10-P90 held-out coverage", coverage >= THRESHOLDS["interval_coverage_min"],
          f"{coverage:.3f} (nominal 0.80, min {THRESHOLDS['interval_coverage_min']}), mean width {float(np.mean(hi - lo)):,.0f} kg/ha")

    # 4. sanity on the served bundle
    sample = df.groupby("crop_type").head(1)[feats]
    served = bundle["pipeline"].predict(sample)
    check("finite, non-negative predictions for every crop", bool(np.all(np.isfinite(served))) and bool(np.all(inv(served) >= -1)),
          f"{len(sample)} crops")
    again = bundle["pipeline"].predict(sample)
    check("deterministic", bool(np.allclose(served, again)), "same input, same output")

    # 5. latency
    rows = [df[feats].iloc[[i]] for i in range(0, min(len(df), 4000), 20)]
    times = []
    for r in rows:
        t0 = time.perf_counter()
        bundle["pipeline"].predict(r)
        times.append((time.perf_counter() - t0) * 1000)
    p50, p95 = float(np.percentile(times, 50)), float(np.percentile(times, 95))
    check("single-row latency p95", p95 <= THRESHOLDS["latency_p95_ms_max"], f"p50 {p50:.2f} ms, p95 {p95:.2f} ms (max {THRESHOLDS['latency_p95_ms_max']})")

    passed = all(c["passed"] for c in checks)
    report = {
        "model": bundle.get("model"),
        "version": card.get("version"),
        "passed": passed,
        "metrics": {"temporal_r2": round(r2, 4), "temporal_rmse": round(rmse, 1), "temporal_mae": round(mae, 1),
                    "heldout_coverage": round(coverage, 4), "latency_p50_ms": round(p50, 2), "latency_p95_ms": round(p95, 2)},
        "thresholds": THRESHOLDS,
        "checks": checks,
    }
    print(f"Model validation: {report['model']} v{report['version']}")
    for c in checks:
        print(f"  [{'PASS' if c['passed'] else 'FAIL'}] {c['check']}: {c['detail']}")
    print("RESULT:", "PASSED" if passed else "FAILED")
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
