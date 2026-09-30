import json
import os
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from backend.app.api.schemas import ActiveModel, Page, context_filters
from backend.app.core.errors import ERROR_RESPONSES, AppError
from backend.app.core.security import is_privileged, require_agronomist, require_user
from backend.app.services import insights, notifications, store
from backend.app.services.dataset import Filters, year_range
from backend.app.services.llm_service import llm_service
from backend.app.services.ml_service import active_model_summary, load_card, ml_service

router = APIRouter(prefix="/api/predict", tags=["Yield Predictions & AI Insights"], responses=ERROR_RESPONSES)
history_router = APIRouter(prefix="/api/predictions", tags=["Prediction History"], responses=ERROR_RESPONSES)


class YieldPredictionRequest(BaseModel):
    # Model inputs: the features the served model was trained on.
    crop_type: str = Field(..., json_schema_extra={"example": "Wheat"})
    region: str = Field(..., json_schema_extra={"example": "India"})
    year: Optional[int] = Field(None, ge=1950, le=2100, description="Season year. Defaults to the latest year in the dataset.")
    rainfall_mm: float = Field(..., ge=0.0, le=5000.0)
    temperature_C: float = Field(..., ge=-10.0, le=60.0)
    pesticide_usage_ml: float = Field(..., ge=0.0)
    total_days: int = Field(..., ge=1, le=400)
    # Field conditions: optional; used for risk flags and insights, not by the model.
    irrigation_type: Optional[str] = Field(None, json_schema_extra={"example": "Drip"})
    fertilizer_type: Optional[str] = Field(None, json_schema_extra={"example": "Urea"})
    crop_disease_status: Optional[str] = Field(None, json_schema_extra={"example": "None"})
    soil_pH: Optional[float] = Field(None, ge=3.0, le=10.0)
    soil_moisture_percent: Optional[float] = Field(None, alias="soil_moisture_%", ge=0.0, le=100.0)
    humidity_percent: Optional[float] = Field(None, alias="humidity_%", ge=0.0, le=100.0)
    sunlight_hours: Optional[float] = Field(None, ge=0.0, le=24.0)
    farm_id: Optional[int] = Field(None, description="Link the prediction to one of your farms")
    record_code: Optional[str] = Field(None, max_length=32, description="Link the prediction to a dataset record")

    model_config = {"populate_by_name": True, "extra": "forbid"}

    def features(self) -> dict:
        data = self.model_dump(by_alias=True, exclude_none=True)
        data.pop("farm_id", None)
        data.pop("record_code", None)
        if data.get("year") is None:
            data["year"] = year_range()[1]
        return data


class PredictionRecord(BaseModel):
    id: str
    username: str
    created_at: str
    farm_id: Optional[int]
    record_code: Optional[str] = None
    year: Optional[int] = None
    model_version: Optional[str] = None
    crop_type: str
    region: str
    inputs: dict
    predicted_yield_kg_ha: float
    low_kg_ha: float
    high_kg_ha: float
    productivity_rating: Literal["Low", "Medium", "High"]
    risk_rating: Literal["Low", "Medium", "High"]
    model_name: str
    model_r2: Optional[float]


class YieldPredictionResponse(PredictionRecord):
    risk_flags: list[str]


class AIInsightsResponse(BaseModel):
    ai_insights: str
    risk_alerts: list[str]
    recommendations: list[str]
    llm_provider: str


class Evidence(BaseModel):
    label: str
    unit: str
    observed: float
    optimal_low: float
    optimal_high: float
    share_affected: float


class TaskState(BaseModel):
    id: str
    status: Literal["open", "done", "dismissed", "snoozed"]
    note: Optional[str]
    snooze_until: Optional[str]
    updated_at: str


class Recommendation(BaseModel):
    id: str
    rule: str
    severity: Literal["critical", "high", "medium", "info"]
    category: Literal["irrigation", "disease_pest", "fertilizer", "crop_planning", "best_practices"]
    title: str
    action: str
    action_label: str
    impact_kg_ha: Optional[float]
    impact_basis: str
    deadline_days: int
    deadline: str
    affected_area: str
    evidence: list[Evidence]
    rationale: str
    rationale_source: str
    task: Optional[TaskState] = None


class ContextClimate(BaseModel):
    source: str
    temperature_C: float
    rainfall_mm: float
    humidity_percent: float
    sunlight_hours: float
    record_count: int


class CycleStage(BaseModel):
    name: str
    start_day: int
    end_day: int


class CropCycle(BaseModel):
    crop: str
    median_days: int
    stages: list[CycleStage]
    source: str


class RecommendationsHub(BaseModel):
    scope: str
    record_count: int
    recommendations: list[Recommendation]
    context: Optional[ContextClimate]
    crop_cycle: Optional[CropCycle]


def _run_prediction(request: YieldPredictionRequest) -> dict:
    try:
        return ml_service.predict_yield(request.features())
    except ValueError as ve:
        raise AppError(400, str(ve))
    except RuntimeError as re:
        raise AppError(503, str(re))


@router.post("", response_model=YieldPredictionResponse)
def predict_crop_yield(request: YieldPredictionRequest, user: dict = Depends(require_user)):
    """Predicts yield with a P10–P90 interval (split-conformal, out-of-time residuals) and saves it to history."""
    result = _run_prediction(request)
    saved = store.save_prediction(user["username"], request.features(), result, active_model_summary(), request.farm_id, request.record_code)
    return {**saved, "risk_flags": result["risk_flags"]}


class WhatIfResponse(BaseModel):
    predicted_yield_kg_ha: float
    low_kg_ha: float
    high_kg_ha: float
    productivity_rating: Literal["Low", "Medium", "High"]
    risk_rating: Literal["Low", "Medium", "High"]
    risk_flags: list[str]


@router.post("/what-if", response_model=WhatIfResponse)
def predict_scenario(request: YieldPredictionRequest, _user: dict = Depends(require_user)):
    """Same prediction as POST /api/predict, but not saved to history (for what-if scenarios)."""
    return _run_prediction(request)


@router.post("/insights", response_model=AIInsightsResponse)
def generate_prediction_insights(request: YieldPredictionRequest, _user: dict = Depends(require_user)):
    result = _run_prediction(request)
    return llm_service.generate_agricultural_insights(request.features(), result)


@router.get("/models")
def get_model_card(_user: dict = Depends(require_agronomist)) -> dict:
    """Model card of the served model: every model on every split, selection rule, interval, features."""
    card = load_card()
    if not card:
        raise AppError(404, "Model card not found. Train the models with scripts/train_models_v2.py.")
    return card


@router.get("/models/active", response_model=ActiveModel)
def get_active_model_summary(_user: dict = Depends(require_user)):
    """Headline metrics of the model that serves predictions. Available to every signed-in role."""
    summary = active_model_summary()
    if not summary:
        raise AppError(404, "Active model metrics not found.")
    return summary


@router.get("/recommendations-hub", response_model=RecommendationsHub)
def get_recommendations_hub(f: Filters = Depends(context_filters), farm_id: Optional[int] = Query(None, description="Scope to one of your farms"), user: dict = Depends(require_user)):
    if farm_id is not None:
        from backend.app.api.management import farm_filters

        f = farm_filters(farm_id, user, f.crop)
    """Rule-based recommendations for the selected region and crop. Thresholds from core/agronomy_rules;
    impacts come from the served model when the rule's feature is a model input; only the rationale text is written by the LLM (with a fallback)."""
    hub = insights.recommendations(f)
    recs = hub["recommendations"]
    tasks = {t["recommendation_id"]: t for t in store.tasks_for_user(user["username"], [r["id"] for r in recs])}
    notifications.sync_recommendations(user["username"], f, recs)
    return {**hub, "recommendations": [{**r, "task": tasks.get(r["id"])} for r in recs]}


# ------------------------------------------------------------------ history


@history_router.get("", response_model=Page[PredictionRecord])
def list_predictions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    crop: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    farm_id: Optional[int] = Query(None),
    record_code: Optional[str] = Query(None),
    user: dict = Depends(require_user),
):
    """Farmers see their own predictions; agronomists and admins see everyone's."""
    owner = None if is_privileged(user) else user["username"]
    return store.list_predictions(owner, page, page_size, crop, region, farm_id, record_code)


@history_router.delete("/{prediction_id}", status_code=204)
def delete_prediction(prediction_id: str, user: dict = Depends(require_user)):
    """Owners can delete their predictions; admins can delete any."""
    record = store.get_prediction(prediction_id)
    if not record or (record["username"] != user["username"] and user.get("role") != "Admin"):
        raise AppError(404, "Prediction not found.")
    store.delete_prediction(prediction_id)
    store.audit(user["username"], "prediction.delete", prediction_id, {"crop": record["crop_type"], "region": record["region"]})


@history_router.get("/{prediction_id}", response_model=PredictionRecord)
def get_prediction(prediction_id: str, user: dict = Depends(require_user)):
    record = store.get_prediction(prediction_id)
    # Someone else's prediction looks the same as a missing one to a farmer.
    if not record or (not is_privileged(user) and record["username"] != user["username"]):
        raise AppError(404, "Prediction not found.")
    return record
