"""Persistence for predictions, field tasks, notifications and the audit log (PostgreSQL)."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, cast

from sqlalchemy import CursorResult, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from backend.app.db.models import AuditLog, Notification, Prediction, RecommendationAction, RiskLevel, User
from backend.app.db.session import session_scope


def new_id() -> str:
    return uuid.uuid4().hex


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds") if dt else None


def _uid(s, username: str) -> int:
    uid = s.scalar(select(User.id).where(func.lower(User.username) == username.lower()))
    if uid is None:
        raise LookupError(f"Unknown user {username}")
    return uid


# ------------------------------------------------------------------ predictions


def _prediction_out(p: Prediction, username: str) -> dict:
    return {
        "id": p.id,
        "username": username,
        "created_at": _iso(p.created_at),
        "farm_id": p.farm_id,
        "record_code": p.record_code,
        "crop_type": p.crop_type,
        "region": p.region,
        "year": p.year,
        "inputs": p.inputs,
        "predicted_yield_kg_ha": p.predicted_yield_kg_ha,
        "low_kg_ha": p.low_kg_ha,
        "high_kg_ha": p.high_kg_ha,
        "productivity_rating": p.productivity_rating,
        "risk_rating": p.risk_rating,
        "model_name": p.model_name,
        "model_version": p.model_version,
        "model_r2": p.model_r2,
    }


def save_prediction(username: str, inputs: dict, result: dict, model: Optional[dict], farm_id: Optional[int], record_code: Optional[str] = None) -> dict:
    with session_scope() as s:
        p = Prediction(
            id=new_id(),
            user_id=_uid(s, username),
            farm_id=farm_id,
            record_code=record_code,
            crop_type=inputs["crop_type"],
            region=inputs["region"],
            year=inputs.get("year"),
            inputs=inputs,
            predicted_yield_kg_ha=result["predicted_yield_kg_ha"],
            low_kg_ha=result["low_kg_ha"],
            high_kg_ha=result["high_kg_ha"],
            productivity_rating=result["productivity_rating"],
            risk_rating=result["risk_rating"],
            model_name=(model or {}).get("name") or "unknown",
            model_version=(model or {}).get("version"),
            model_r2=(model or {}).get("r2"),
        )
        s.add(p)
        s.flush()
        return _prediction_out(p, username)


def list_predictions(username: Optional[str], page: int, page_size: int, crop: Optional[str] = None, region: Optional[str] = None,
                     farm_id: Optional[int] = None, record_code: Optional[str] = None) -> dict:
    with session_scope() as s:
        q = select(Prediction, User.username).join(User, User.id == Prediction.user_id)
        if username:
            q = q.where(func.lower(User.username) == username.lower())
        if crop:
            q = q.where(func.lower(Prediction.crop_type) == crop.lower())
        if region:
            q = q.where(func.lower(Prediction.region) == region.lower())
        if farm_id is not None:
            q = q.where(Prediction.farm_id == farm_id)
        if record_code:
            q = q.where(Prediction.record_code == record_code)
        total = s.scalar(select(func.count()).select_from(q.subquery())) or 0
        rows = s.execute(q.order_by(Prediction.created_at.desc(), Prediction.id).limit(page_size).offset((page - 1) * page_size)).all()
        items = [_prediction_out(cast(Prediction, r[0]), cast(str, r[1])) for r in rows]
        return {"items": items, "total": total, "page": page, "page_size": page_size}


def get_prediction(pred_id: str) -> Optional[dict]:
    with session_scope() as s:
        row = s.execute(select(Prediction, User.username).join(User, User.id == Prediction.user_id).where(Prediction.id == pred_id)).first()
        return _prediction_out(cast(Prediction, row[0]), cast(str, row[1])) if row else None


def delete_prediction(pred_id: str) -> bool:
    with session_scope() as s:
        p = s.get(Prediction, pred_id)
        if not p:
            return False
        s.delete(p)
        return True


# ------------------------------------------------------------------ field tasks

TASK_STATUS_BY_ACTION = {"create_task": "open", "done": "done", "dismiss": "dismissed", "snooze": "snoozed"}


def _task_out(t: RecommendationAction, username: str) -> dict:
    return {
        "id": t.id,
        "recommendation_id": t.recommendation_id,
        "title": t.title,
        "region": t.region,
        "crop_type": t.crop_type,
        "farm_id": t.farm_id,
        "status": t.status,
        "note": t.note,
        "snooze_until": _iso(t.snooze_until),
        "username": username,
        "created_at": _iso(t.created_at),
        "updated_at": _iso(t.updated_at),
    }


def upsert_task(rec: dict, username: str, action: str, note: Optional[str], snooze_days: int, farm_id: Optional[int] = None) -> dict:
    status = TASK_STATUS_BY_ACTION[action]
    snooze_until = datetime.now(timezone.utc) + timedelta(days=snooze_days) if status == "snoozed" else None
    with session_scope() as s:
        uid = _uid(s, username)
        t = s.scalar(select(RecommendationAction).where(RecommendationAction.recommendation_id == rec["id"], RecommendationAction.user_id == uid))
        if t:
            t.status = status
            t.snooze_until = snooze_until
            if note:
                t.note = note
        else:
            t = RecommendationAction(
                id=new_id(), user_id=uid, recommendation_id=rec["id"], farm_id=farm_id, title=rec["title"],
                region=rec.get("_region"), crop_type=rec.get("_crop"), status=status, note=note, snooze_until=snooze_until,
            )
            s.add(t)
        s.flush()
        return _task_out(t, username)


def tasks_for_user(username: str, recommendation_ids: Optional[list[str]] = None) -> list[dict]:
    with session_scope() as s:
        uid = _uid(s, username)
        q = select(RecommendationAction).where(RecommendationAction.user_id == uid)
        if recommendation_ids is not None:
            if not recommendation_ids:
                return []
            q = q.where(RecommendationAction.recommendation_id.in_(recommendation_ids))
        return [_task_out(t, username) for t in s.scalars(q.order_by(RecommendationAction.updated_at.desc()))]


# ------------------------------------------------------------------ notifications


def _notif_out(n: Notification, username: str) -> dict:
    return {
        "id": n.id,
        "username": username,
        "category": n.category,
        "severity": n.severity,
        "title": n.title,
        "body": n.body,
        "link": n.link,
        "created_at": _iso(n.created_at),
        "read_at": _iso(n.read_at),
        "read": n.read_at is not None,
    }


def notify(username: str, category: str, severity: str, title: str, body: str, dedupe_key: str, link: Optional[str] = None) -> bool:
    """Creates a notification unless one with the same dedupe key exists, and only if the user
    has that category enabled. Returns True if created."""
    with session_scope() as s:
        u = s.scalar(select(User).where(func.lower(User.username) == username.lower()))
        if not u or (u.notification_prefs or {}).get(category, True) is False:
            return False
        stmt = (
            pg_insert(Notification)
            .values(id=new_id(), user_id=u.id, category=category, severity=severity, title=title, body=body, link=link, dedupe_key=dedupe_key, created_at=datetime.now(timezone.utc))
            .on_conflict_do_nothing(constraint="uq_notification_dedupe")
        )
        return (cast(CursorResult[Any], s.execute(stmt)).rowcount or 0) > 0


def list_notifications(username: str, page: int, page_size: int, category: Optional[str], unread_only: bool) -> dict:
    with session_scope() as s:
        uid = _uid(s, username)
        q = select(Notification).where(Notification.user_id == uid)
        if category:
            q = q.where(Notification.category == category)
        if unread_only:
            q = q.where(Notification.read_at.is_(None))
        total = s.scalar(select(func.count()).select_from(q.subquery())) or 0
        unread = s.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == uid, Notification.read_at.is_(None))) or 0
        rows = s.scalars(q.order_by(Notification.created_at.desc(), Notification.id).limit(page_size).offset((page - 1) * page_size))
        return {"items": [_notif_out(n, username) for n in rows], "total": total, "page": page, "page_size": page_size, "unread_count": unread}


def set_notification_read(username: str, notification_id: str, read: bool) -> Optional[dict]:
    with session_scope() as s:
        uid = _uid(s, username)
        n = s.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == uid))
        if not n:
            return None
        n.read_at = datetime.now(timezone.utc) if read else None
        s.flush()
        return _notif_out(n, username)


def mark_all_read(username: str) -> int:
    with session_scope() as s:
        uid = _uid(s, username)
        res = cast(CursorResult[Any], s.execute(update(Notification).where(Notification.user_id == uid, Notification.read_at.is_(None)).values(read_at=datetime.now(timezone.utc))))
        return res.rowcount or 0


def swap_risk_level(username: str, context_key: str, risk_type: str, level: str) -> Optional[str]:
    """Stores the latest level and returns the previous one (None if first seen)."""
    with session_scope() as s:
        uid = _uid(s, username)
        row = s.get(RiskLevel, (uid, context_key, risk_type))
        previous = row.level if row else None
        if row:
            row.level = level
        else:
            s.add(RiskLevel(user_id=uid, context_key=context_key, risk_type=risk_type, level=level))
        return previous


# ------------------------------------------------------------------ audit log


def audit(actor: str, action: str, target: str, detail: dict) -> None:
    with session_scope() as s:
        actor_id = s.scalar(select(User.id).where(func.lower(User.username) == actor.lower()))
        s.add(AuditLog(id=new_id(), actor_id=actor_id, actor=actor, action=action, target=target, detail=detail))


def list_audit(page: int, page_size: int) -> dict:
    with session_scope() as s:
        total = s.scalar(select(func.count()).select_from(AuditLog)) or 0
        rows = s.scalars(select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id).limit(page_size).offset((page - 1) * page_size))
        items = [{"id": a.id, "actor": a.actor, "action": a.action, "target": a.target, "detail": a.detail, "created_at": _iso(a.created_at)} for a in rows]
        return {"items": items, "total": total, "page": page, "page_size": page_size}
