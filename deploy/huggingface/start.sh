#!/usr/bin/env bash
# Runs the API and Nginx side by side. If either stops, the container exits so the platform restarts it.
set -euo pipefail

uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips "*" &
api=$!

# Wait for the API before accepting traffic, so the first visitor doesn't get a 502.
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done

nginx -c /app/nginx.conf -g "daemon off;" &
web=$!
echo "[start] YieldSense AI listening on port 7860"

wait -n "$api" "$web"
echo "[start] a process exited; stopping the container" >&2
exit 1
