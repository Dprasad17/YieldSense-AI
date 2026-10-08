# YieldSense AI in one container (Render, Hugging Face Spaces or any Docker host).
# Nginx serves the web app on $PORT (default 7860) and forwards /api to the FastAPI app on 127.0.0.1:8000.
# PostgreSQL and MongoDB are external free services (Neon, MongoDB Atlas) passed in as environment secrets.
# Build context is the repository root (Render: render.yaml; Hugging Face: deploy_space.py builds the bundle).

FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_URL=""
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# CPU-only XGBoost: same predictions without ~350 MB of GPU libraries.
RUN sed 's/^xgboost==/xgboost-cpu==/' requirements.txt > /tmp/requirements.txt \
    && pip install -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY backend ./backend
COPY scripts/seed.py scripts/create_admin.py ./scripts/
COPY models/v2 ./models/v2
COPY models/disease ./models/disease
COPY models/registry.json ./models/registry.json
COPY datasets/processed ./datasets/processed
COPY eda_plots ./eda_plots
COPY --from=web /web/dist /app/web
COPY deploy/huggingface/nginx.conf /app/nginx.conf
COPY deploy/huggingface/start.sh /app/start.sh
COPY backend/docker-entrypoint.sh /app/docker-entrypoint.sh

# Spaces run the container as uid 1000; give it the app folder and nginx's runtime paths.
RUN sed -i 's/\r$//' /app/start.sh /app/docker-entrypoint.sh \
    && chmod +x /app/start.sh /app/docker-entrypoint.sh \
    && useradd --create-home --uid 1000 user \
    && mkdir -p /tmp/nginx \
    && chown -R user:user /app /tmp/nginx
USER user

ENV APP_ENV=production \
    WEB_CONCURRENCY=1 \
    SEED_ON_START=true \
    SEED_DEMO_DATA=true \
    MONGO_DB=yieldsense

EXPOSE 7860
# start.sh opens the web port first, then migrates/seeds and starts the API (see the script).
CMD ["/app/start.sh"]
