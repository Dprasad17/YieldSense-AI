# Milestone 4 checklist — Testing, deployment and documentation

Status as of 8 October 2026 (branch `DURGA-PRASAD-A`). Same rule as the Milestone 1–3 checklist: an item is **Done** only when it has been run and verified, not merely written.

Legend: ✅ Done and verified · 🟡 Implemented, waiting for a run in the target environment · ⏳ Needs your setup (see "What you need to set up")

## Requirements (specification, Milestone 4)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Validate prediction models and forecasting accuracy | ✅ | `scripts/validate_model.py`: refits the served pipeline on 1990–2008 and scores 2009–2013 (R² 0.9545, RMSE 2,028, MAE 1,080 kg/ha), held-out P10–P90 coverage 0.745, feature integrity, sanity, latency p95 16 ms. Runs in CI on every push and fails the build below the thresholds |
| Optimize system performance and dashboard responsiveness | ✅ | Lighthouse 99–100 on `/`, `/login`, `/app/dashboard` (also when served by the Nginx container); `scripts/load_test.py` against the Docker stack: 72 req/s, p95 507 ms, 0 errors with 20 concurrent users. 2 API workers (configurable), Nginx gzip, long-term caching of hashed assets, API image halved by using CPU-only XGBoost |
| Deploy with Docker | ✅ | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` (PostgreSQL, MongoDB, API, web, optional HTTPS). Built and run on Docker Desktop: all four services healthy, browser test 38/38 with 0 console errors, load test 72 req/s at 20 users (p95 507 ms, 0 errors), Lighthouse 99–100. API image 831 MB with CPU-only XGBoost (identical predictions), web image 77 MB |
| Deploy to a cloud environment (AWS / Azure) | ⏳ | `deploy/server-setup.sh`, `docker-compose.prod.yml`, `.github/workflows/deploy.yml` (GHCR images → VM over SSH → health smoke test), HTTPS via Caddy. Needs a VM and repository secrets |
| CI/CD | 🟡 | `.github/workflows/ci.yml` (backend tests + model gate, frontend checks, Docker build, full-stack browser and load test) and `deploy.yml`. Not yet run on GitHub |
| Final project documentation | ✅ | `README.md`, `docs/deployment.md`, `docs/system_architecture.md`, `docs/ui_layout.md`, `docs/database-schema.md`, both milestone checklists, Postman collection, model card |
| Presentation | ⏳ | Not started: tell me the format (PowerPoint, PDF or a web page) and the time slot |
| Demonstrate the complete platform | ⏳ | Possible locally now; on a public URL once deployed |

## Operations and security added in this milestone

| Item | Status | Evidence |
| --- | --- | --- |
| Containers run as non-root, health-checked, restart automatically | ✅ | API runs as uid 10001; healthchecks on all four services, all reported healthy; `restart: unless-stopped` |
| Databases not exposed outside Docker | ✅ | `docker compose ps`: only `web` publishes a port (80); PostgreSQL, MongoDB and the API are internal |
| Demo accounts can be switched off | ✅ | `SEED_DEMO_DATA=false`; `scripts/create_admin.py` creates the first administrator (tested) |
| Backups and restore | ✅ | `deploy/backup.sh` (PostgreSQL + MongoDB, 14-day retention). Restore rehearsed in the local containers: dumps (816 KB and 152 KB) restored into scratch databases with identical counts for every table (28,242 crop records, users, farms, farm records, predictions) and every MongoDB collection |
| HTTPS | ⏳ | Caddy with automatic certificates (`--profile tls`); needs a domain |
| Rollback | 🟡 | Images tagged per commit; re-deploy an earlier tag |

## What you need to set up

1. ~~Docker Desktop~~ — done: the stack is built and verified locally.
2. **Push the branch to GitHub** so CI runs. GitHub Actions must be enabled for the repository (in an organisation repository, an owner may need to allow it).
3. **A cloud VM**: AWS EC2 (`t3.small`/`t3.medium`, Ubuntu 24.04) or Azure VM (`Standard_B2s`, Ubuntu 24.04), with ports 22, 80 and 443 open. Free-tier/student credits are enough for a demo.
4. **Repository secrets and variables**: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `PUBLIC_URL`, optionally `DEPLOY_ENABLED` and `COMPOSE_PROFILES` (details in `docs/deployment.md`).
5. **Optional**: a domain name for HTTPS, and the Groq API key in the server's `.env.docker`.
