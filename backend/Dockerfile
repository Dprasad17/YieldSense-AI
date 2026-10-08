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
RUN pip install -r requirements.txt

COPY backend ./backend
COPY scripts/seed.py ./scripts/seed.py
COPY models/v2 ./models/v2
COPY datasets/processed ./datasets/processed
COPY eda_plots ./eda_plots
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Strip Windows line endings in case the file was checked out with CRLF.
RUN sed -i 's/$//' /usr/local/bin/docker-entrypoint.sh \n    && chmod +x /usr/local/bin/docker-entrypoint.sh \
    && useradd --create-home --uid 10001 yieldsense \
    && chown -R yieldsense:yieldsense /app
USER yieldsense

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]
