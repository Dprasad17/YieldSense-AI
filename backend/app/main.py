import hashlib
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.api.analytics import router as analytics_router
from backend.app.api.auth import router as auth_router
from backend.app.api.data import router as data_router
from backend.app.api.domain import (
    admin_router,
    records_router,
    notifications_router,
    risk_router,
    soil_router,
    weather_router,
)
from backend.app.api.intelligence import (
    assistant_router,
    digest_router,
    disease_router,
    market_router,
    ops_router,
    satellite_router,
)
from backend.app.api.predictions import history_router, router as predictions_router
from backend.app.api.management import farms_router, soil_tests_router
from backend.app.api.public import router as public_router
from backend.app.api.uploads import router as uploads_router
from backend.app.api.recommendations import router as recommendations_router
from backend.app.api.reports import router as reports_router
from backend.app.core.config import settings
from backend.app.core.errors import install_error_handlers
from backend.app.core.observability import RequestContextMiddleware
from backend.app.services.dataset import get_df
from backend.app.core.observability import log
from backend.app.core.ratelimit import api_limiter


def _init_sentry() -> None:
    """Error tracking when SENTRY_DSN is set (no request bodies or personal data are sent)."""
    if not settings.SENTRY_DSN:
        return
    try:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.APP_ENV, release=settings.PROJECT_VERSION, traces_sample_rate=0.05, send_default_pii=False)
        log.info("[startup] Sentry error tracking enabled")
    except Exception as e:
        log.warning(f"[startup] Sentry not started: {e}")


_init_sentry()


@asynccontextmanager
async def lifespan(_: FastAPI):
    from backend.app.db import mongo

    try:
        mongo.ensure_indexes()
    except Exception as e:
        log.warning(f"[startup] MongoDB unavailable: {e}")
    get_df()  # load crop records once at startup
    yield


app = FastAPI(
    lifespan=lifespan,
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    description="YieldSense AI - Crop Yield Prediction & Agricultural Productivity Intelligence Platform API",
)

# Auth is a Bearer header, not cookies, so credentials are not needed cross-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"],
    expose_headers=["Content-Disposition", "X-Total-Records", "X-Truncated", "Retry-After", "X-Request-ID", "Server-Timing"],
)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    """API-wide limit per signed-in user (token) or per IP; health checks and static files are exempt."""
    path = request.url.path
    if path.startswith("/api/") and path != "/api/health" and request.method != "OPTIONS":
        auth = request.headers.get("authorization", "")
        key = "t:" + hashlib.sha256(auth.encode()).hexdigest()[:24] if auth.lower().startswith("bearer ") else "ip:" + (request.client.host if request.client else "?")
        wait = api_limiter.take(key)
        if wait:
            return JSONResponse(
                {"error": {"code": "rate_limited", "message": f"Too many requests. Try again in {wait} seconds.", "request_id": getattr(request.state, "request_id", None)}},
                status_code=429,
                headers={"Retry-After": str(wait)},
            )
    return await call_next(request)


# Added after CORS so it wraps it: every response, including preflights and errors, gets an ID.
app.add_middleware(RequestContextMiddleware)
install_error_handlers(app)

plots_dir = "eda_plots"
os.makedirs(plots_dir, exist_ok=True)
app.mount("/eda_plots", StaticFiles(directory=plots_dir), name="eda_plots")

for r in (
    public_router,
    auth_router,
    data_router,
    analytics_router,
    predictions_router,
    history_router,
    recommendations_router,
    weather_router,
    soil_router,
    reports_router,
    records_router,
    risk_router,
    notifications_router,
    admin_router,
    farms_router,
    soil_tests_router,
    uploads_router,
    assistant_router,
    satellite_router,
    market_router,
    disease_router,
    ops_router,
    digest_router,
):
    app.include_router(r)


@app.get("/")
def root():
    return {"status": "online", "platform": settings.PROJECT_NAME, "version": settings.PROJECT_VERSION, "documentation": "/docs"}


@app.get("/api/health")
def health_check():
    """Liveness plus dependency checks: PostgreSQL, MongoDB and the loaded model."""
    from sqlalchemy import text

    from backend.app.db import mongo
    from backend.app.db.session import engine
    from backend.app.services.ml_service import ml_service

    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    from backend.app.core.observability import uptime_seconds

    checks = {"database": db_ok, "mongo": mongo.ping(), "model_loaded": ml_service.is_ready()}
    return {
        "status": "healthy" if all(checks.values()) else "degraded",
        "service": "YieldSense AI Backend",
        "version": settings.PROJECT_VERSION,
        "uptime_s": uptime_seconds(),
        "checks": checks,
    }
