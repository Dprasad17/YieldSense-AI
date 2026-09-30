import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
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
from backend.app.api.predictions import history_router, router as predictions_router
from backend.app.api.management import farms_router, soil_tests_router
from backend.app.api.public import router as public_router
from backend.app.api.uploads import router as uploads_router
from backend.app.api.recommendations import router as recommendations_router
from backend.app.api.reports import router as reports_router
from backend.app.core.config import settings
from backend.app.core.errors import install_error_handlers
from backend.app.services.dataset import get_df

@asynccontextmanager
async def lifespan(_: FastAPI):
    from backend.app.db import mongo

    try:
        mongo.ensure_indexes()
    except Exception as e:
        print(f"[startup] MongoDB unavailable: {e}")
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
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["Content-Disposition", "X-Total-Records", "X-Truncated", "Retry-After"],
)
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
    checks = {"database": db_ok, "mongo": mongo.ping(), "model_loaded": ml_service.is_ready()}
    return {"status": "healthy" if all(checks.values()) else "degraded", "service": "YieldSense AI Backend", "checks": checks}
