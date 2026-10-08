# YieldSense AI API: FastAPI + XGBoost model, PostgreSQL and MongoDB clients.
# Build from the repository root:  docker build -f backend/Dockerfile -t yieldsense-api .

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# libgomp1: OpenMP runtime needed by XGBoost and scikit-learn wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Runtime dependencies only (no TensorFlow / LightGBM / plotting: those are in requirements-train.txt).
COPY requirements.txt .
# xgboost-cpu is the same library without the CUDA/NCCL GPU runtime (about 350 MB the API never uses).
RUN sed 's/^xgboost==/xgboost-cpu==/' requirements.txt > /tmp/requirements.txt \
    && pip install -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY backend ./backend
COPY scripts/seed.py scripts/create_admin.py ./scripts/
COPY models/v2 ./models/v2
COPY datasets/processed ./datasets/processed
COPY eda_plots ./eda_plots
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Strip Windows line endings in case the file was checked out with CRLF.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh \
    && useradd --create-home --uid 10001 yieldsense \
    && chown -R yieldsense:yieldsense /app
USER yieldsense

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
# Worker processes come from WEB_CONCURRENCY (uvicorn reads it). Each worker keeps its own in-memory
# request metrics and sign-in rate limit, so the admin metrics show the worker that answered.
ENV WEB_CONCURRENCY=2
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
