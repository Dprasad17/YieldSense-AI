from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from backend.app.core.errors import ERROR_RESPONSES, AppError
from backend.app.core.security import require_user
from backend.app.services import insights, store

router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"], responses=ERROR_RESPONSES)

ACTION_MESSAGES = {
    "create_task": "Field task created",
    "done": "Marked as done",
    "dismiss": "Dismissed",
    "snooze": "Snoozed",
}


class ActionRequest(BaseModel):
    action: Literal["create_task", "done", "dismiss", "snooze"]
    note: Optional[str] = Field(None, max_length=500)
    snooze_days: int = Field(3, ge=1, le=30)


class Task(BaseModel):
    id: str
    recommendation_id: str
    title: str
    region: Optional[str]
    crop_type: Optional[str]
    status: Literal["open", "done", "dismissed", "snoozed"]
    note: Optional[str]
    snooze_until: Optional[str]
    username: str
    created_at: str
    updated_at: str


class ActionResponse(BaseModel):
    message: str
    task: Task


def _find_recommendation(rec_id: str) -> dict:
    f = insights.parse_recommendation_id(rec_id)
    if not f:
        raise AppError(404, "Recommendation not found.")
    rec = next((r for r in insights.recommendations(f)["recommendations"] if r["id"] == rec_id), None)
    if not rec:
        raise AppError(404, "This recommendation no longer applies to the current data.")
    return {**rec, "_region": f.region, "_crop": f.crop}


@router.post("/{rec_id}/actions", response_model=ActionResponse)
def act_on_recommendation(rec_id: str, body: ActionRequest, user: dict = Depends(require_user)):
    """Records what the user did with a recommendation. There is no field hardware: "create_task"
    creates a task in YieldSense, it does not dispatch anything to equipment."""
    rec = _find_recommendation(rec_id)
    task = store.upsert_task(rec, user["username"], body.action, body.note, body.snooze_days)
    message = ACTION_MESSAGES[body.action]
    if body.action == "create_task":
        store.notify(
            user["username"],
            category="recommendations",
            severity="info",
            title=f"{message}: {rec['title']}",
            body=f"{rec['affected_area']}. Due {rec['deadline']}.",
            dedupe_key=f"task:{task['id']}:open",
            link="/app/recommendations",
        )
    return {"message": message, "task": task}


@router.get("/tasks", response_model=list[Task])
def list_tasks(user: dict = Depends(require_user)):
    return store.tasks_for_user(user["username"])
