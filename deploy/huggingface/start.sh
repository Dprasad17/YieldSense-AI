#!/usr/bin/env bash
# Single-container start-up (Render, Hugging Face Spaces, any Docker host).
# 1. Nginx starts first on $PORT (Render sets it; default 7860), so the platform sees an open port at once
#    and visitors get the web app while the API is still preparing.
# 2. Wait for the databases, apply migrations, seed (idempotent).
# 3. Start the API. If Nginx or the API stops, the container exits and the platform restarts it.
set -euo pipefail

PORT="${PORT:-7860}"
mkdir -p /tmp/nginx
sed "s/listen 7860;/listen ${PORT};/" /app/nginx.conf > /tmp/nginx/nginx.conf
nginx -c /tmp/nginx/nginx.conf -g "daemon off;" &
web=$!
echo "[start] web server listening on port ${PORT}; preparing the API"

# Migrations and seeding (docker-entrypoint.sh runs them, then execs its arguments: here `true`).
/app/docker-entrypoint.sh true

uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips "*" &
api=$!
echo "[start] API starting"

wait -n "$api" "$web"
echo "[start] a process exited; stopping the container" >&2
exit 1
