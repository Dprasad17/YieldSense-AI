"""
Concurrent load test for the YieldSense API (standard library only).

Signs in once, then sends requests from several worker threads for a fixed time, mixing the
endpoints the dashboard and predictor call. Reports throughput, latency percentiles and errors.

    python scripts/load_test.py --base http://localhost:8000 --users 20 --seconds 30
    python scripts/load_test.py --base https://your.domain --users 10 --seconds 60 --json load.json
"""
import argparse
import json
import random
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict

SCENARIO = [
    # (weight, method, path, body)
    (4, "POST", "/api/predict/what-if", {"crop_type": "Rice", "region": "India", "year": 2013, "rainfall_mm": 1083, "temperature_C": 26.7, "pesticide_usage_ml": 4562000}),
    (2, "GET", "/api/data/summary", None),
    (2, "GET", "/api/analytics/seasonal-trends?region=India&crop=Rice", None),
    (2, "GET", "/api/predict/recommendations-hub?region=India&crop=Rice", None),
    (1, "GET", "/api/risk?region=India&crop=Rice", None),
    (1, "GET", "/api/predict/models/active", None),
]


def request(base: str, method: str, path: str, body, token: str | None, timeout: float = 30):
    headers = {"Content-Type": "application/json", "User-Agent": "yieldsense-load-test"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = r.read()
            return r.status, (time.perf_counter() - t0) * 1000, payload
    except urllib.error.HTTPError as e:
        return e.code, (time.perf_counter() - t0) * 1000, b""
    except Exception:  # timeouts, connection errors
        return 0, (time.perf_counter() - t0) * 1000, b""


def pct(values: list[float], p: float) -> float:
    if not values:
        return float("nan")
    s = sorted(values)
    return s[min(len(s) - 1, int(round(p / 100 * (len(s) - 1))))]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--users", type=int, default=10, help="concurrent workers")
    ap.add_argument("--seconds", type=int, default=30)
    ap.add_argument("--username", default="farmer")
    ap.add_argument("--password", default="farmer123")
    ap.add_argument("--json", help="write the report to this file")
    ap.add_argument("--max-error-rate", type=float, default=0.01, help="exit 1 above this share of failed requests")
    args = ap.parse_args()
    base = args.base.rstrip("/")

    status, _, payload = request(base, "POST", "/api/auth/login", {"username": args.username, "password": args.password}, None)
    if status != 200:
        print(f"Sign-in failed with HTTP {status}", file=sys.stderr)
        return 2
    token = json.loads(payload)["access_token"]

    weighted = [s for s in SCENARIO for _ in range(s[0])]
    latencies: dict[str, list[float]] = defaultdict(list)
    statuses: Counter = Counter()
    lock = threading.Lock()
    stop_at = time.time() + args.seconds

    def worker(seed: int) -> None:
        rng = random.Random(seed)
        while time.time() < stop_at:
            _, method, path, body = rng.choice(weighted)
            code, ms, _ = request(base, method, path, body, token)
            with lock:
                latencies[path.split("?")[0]].append(ms)
                statuses[code] += 1

    threads = [threading.Thread(target=worker, args=(i,), daemon=True) for i in range(args.users)]
    started = time.time()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    elapsed = time.time() - started

    all_ms = [v for vs in latencies.values() for v in vs]
    total = sum(statuses.values())
    errors = sum(n for code, n in statuses.items() if code == 0 or code >= 500)
    report = {
        "base": base,
        "users": args.users,
        "seconds": round(elapsed, 1),
        "requests": total,
        "throughput_rps": round(total / elapsed, 1) if elapsed else 0,
        "error_rate": round(errors / total, 4) if total else 1.0,
        "status_counts": {str(k): v for k, v in sorted(statuses.items())},
        "latency_ms": {"p50": round(pct(all_ms, 50), 1), "p95": round(pct(all_ms, 95), 1), "p99": round(pct(all_ms, 99), 1),
                       "mean": round(statistics.fmean(all_ms), 1) if all_ms else None},
        "per_endpoint": {
            p: {"requests": len(v), "p50_ms": round(pct(v, 50), 1), "p95_ms": round(pct(v, 95), 1)} for p, v in sorted(latencies.items())
        },
    }
    print(f"{total} requests in {elapsed:.1f}s with {args.users} workers: {report['throughput_rps']} req/s, "
          f"p50 {report['latency_ms']['p50']} ms, p95 {report['latency_ms']['p95']} ms, p99 {report['latency_ms']['p99']} ms, "
          f"errors {report['error_rate'] * 100:.2f}%")
    for p, s in report["per_endpoint"].items():
        print(f"  {p:45s} {s['requests']:6d} req  p50 {s['p50_ms']:7.1f} ms  p95 {s['p95_ms']:7.1f} ms")
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
    return 0 if report["error_rate"] <= args.max_error_rate else 1


if __name__ == "__main__":
    sys.exit(main())
