"""Persistence for predictions, field tasks, notifications and the audit log (SQLite)."""
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from backend.app.core.db import connection, dumps, new_id, now_iso, row_to_dict

# ------------------------------------------------------------------ predictions


def save_prediction(username: str, inputs: dict, result: dict, model: Optional[dict], farm_id: Optional[str]) -> dict:
    record = {
        "id": new_id(),
        "username": username,
        "created_at": now_iso(),
        "farm_id": farm_id,
        "crop_type": inputs["crop_type"],
        "region": inputs["region"],
        "inputs_json": dumps(inputs),
        "predicted_yield_kg_ha": result["predicted_yield_kg_ha"],
        "low_kg_ha": result["low_kg_ha"],
        "high_kg_ha": result["high_kg_ha"],
        "productivity_rating": result["productivity_rating"],
        "risk_rating": result["risk_rating"],
        "model_name": (model or {}).get("name") or "unknown",
        "model_r2": (model or {}).get("r2"),
    }
    with connection() as db:
        db.execute(
            f"INSERT INTO predictions ({', '.join(record)}) VALUES ({', '.join('?' * len(record))})",
            list(record.values()),
        )
    return _prediction_out(record)


def _prediction_out(row: dict) -> dict:
    out = dict(row)
    out["inputs"] = json.loads(out.pop("inputs_json"))
    return out


def list_predictions(username: Optional[str], page: int, page_size: int, crop: Optional[str] = None,
                     region: Optional[str] = None, farm_id: Optional[str] = None) -> dict:
    where, params = [], []
    for col, val in (("username", username), ("crop_type", crop), ("region", region), ("farm_id", farm_id)):
        if val:
            where.append(f"{col} = ? COLLATE NOCASE")
            params.append(val)
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    with connection() as db:
        total = db.execute(f"SELECT COUNT(*) FROM predictions {clause}", params).fetchone()[0]
        rows = db.execute(
            f"SELECT * FROM predictions {clause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?",
            [*params, page_size, (page - 1) * page_size],
        ).fetchall()
    return {"items": [_prediction_out(dict(r)) for r in rows], "total": total, "page": page, "page_size": page_size}


def get_prediction(pred_id: str) -> Optional[dict]:
    with connection() as db:
        row = row_to_dict(db.execute("SELECT * FROM predictions WHERE id = ?", [pred_id]).fetchone())
    return _prediction_out(row) if row else None


# ------------------------------------------------------------------ field tasks

TASK_STATUS_BY_ACTION = {"create_task": "open", "done": "done", "dismiss": "dismissed", "snooze": "snoozed"}


def upsert_task(rec: dict, username: str, action: str, note: Optional[str], snooze_days: int) -> dict:
    status = TASK_STATUS_BY_ACTION[action]
    now = now_iso()
    snooze_until = (
        (datetime.now(timezone.utc) + timedelta(days=snooze_days)).isoformat(timespec="seconds")
        if status == "snoozed"
        else None
    )
    region, crop = rec.get("_region"), rec.get("_crop")
    with connection() as db:
        existing = row_to_dict(
            db.execute("SELECT * FROM tasks WHERE recommendation_id = ? AND username = ?", [rec["id"], username]).fetchone()
        )
        if existing:
            db.execute(
                "UPDATE tasks SET status = ?, note = COALESCE(?, note), snooze_until = ?, updated_at = ? WHERE id = ?",
                [status, note, snooze_until, now, existing["id"]],
            )
            task_id = existing["id"]
        else:
            task_id = new_id()
            db.execute(
                "INSERT INTO tasks (id, recommendation_id, title, region, crop_type, status, note, snooze_until, username, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [task_id, rec["id"], rec["title"], region, crop, status, note, snooze_until, username, now, now],
            )
        row = row_to_dict(db.execute("SELECT * FROM tasks WHERE id = ?", [task_id]).fetchone())
    assert row is not None
    return row


def tasks_for_user(username: str, recommendation_ids: Optional[list[str]] = None) -> list[dict]:
    with connection() as db:
        if recommendation_ids is not None:
            if not recommendation_ids:
                return []
            marks = ",".join("?" * len(recommendation_ids))
            rows = db.execute(
                f"SELECT * FROM tasks WHERE username = ? AND recommendation_id IN ({marks})", [username, *recommendation_ids]
            ).fetchall()
        else:
            rows = db.execute("SELECT * FROM tasks WHERE username = ? ORDER BY updated_at DESC", [username]).fetchall()
    return [dict(r) for r in rows]


# ------------------------------------------------------------------ notifications


def notify(username: str, category: str, severity: str, title: str, body: str, dedupe_key: str,
           link: Optional[str] = None) -> bool:
    """Creates a notification unless one with the same dedupe key exists. Returns True if created."""
    with connection() as db:
        cur = db.execute(
            "INSERT OR IGNORE INTO notifications (id, username, category, severity, title, body, link, dedupe_key, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [new_id(), username, category, severity, title, body, link, dedupe_key, now_iso()],
        )
        return cur.rowcount > 0


def list_notifications(username: str, page: int, page_size: int, category: Optional[str], unread_only: bool) -> dict:
    where, params = ["username = ?"], [username]
    if category:
        where.append("category = ?")
        params.append(category)
    if unread_only:
        where.append("read_at IS NULL")
    clause = " AND ".join(where)
    with connection() as db:
        total = db.execute(f"SELECT COUNT(*) FROM notifications WHERE {clause}", params).fetchone()[0]
        unread = db.execute("SELECT COUNT(*) FROM notifications WHERE username = ? AND read_at IS NULL", [username]).fetchone()[0]
        rows = db.execute(
            f"SELECT * FROM notifications WHERE {clause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?",
            [*params, page_size, (page - 1) * page_size],
        ).fetchall()
    items = [{**dict(r), "read": r["read_at"] is not None} for r in rows]
    for i in items:
        i.pop("dedupe_key", None)
    return {"items": items, "total": total, "page": page, "page_size": page_size, "unread_count": unread}


def set_notification_read(username: str, notification_id: str, read: bool) -> Optional[dict]:
    with connection() as db:
        db.execute(
            "UPDATE notifications SET read_at = ? WHERE id = ? AND username = ?",
            [now_iso() if read else None, notification_id, username],
        )
        row = row_to_dict(
            db.execute("SELECT * FROM notifications WHERE id = ? AND username = ?", [notification_id, username]).fetchone()
        )
    if not row:
        return None
    row.pop("dedupe_key", None)
    return {**row, "read": row["read_at"] is not None}


def mark_all_read(username: str) -> int:
    with connection() as db:
        cur = db.execute("UPDATE notifications SET read_at = ? WHERE username = ? AND read_at IS NULL", [now_iso(), username])
        return cur.rowcount


def swap_risk_level(username: str, context_key: str, risk_type: str, level: str) -> Optional[str]:
    """Stores the latest level and returns the previous one (None if first seen)."""
    with connection() as db:
        row = db.execute(
            "SELECT level FROM risk_levels WHERE username = ? AND context_key = ? AND risk_type = ?",
            [username, context_key, risk_type],
        ).fetchone()
        db.execute(
            "INSERT INTO risk_levels (username, context_key, risk_type, level) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(username, context_key, risk_type) DO UPDATE SET level = excluded.level",
            [username, context_key, risk_type, level],
        )
    return row["level"] if row else None


# ------------------------------------------------------------------ audit log


def audit(actor: str, action: str, target: str, detail: dict) -> None:
    with connection() as db:
        db.execute(
            "INSERT INTO audit_log (id, actor, action, target, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [new_id(), actor, action, target, dumps(detail), now_iso()],
        )


def list_audit(page: int, page_size: int) -> dict:
    with connection() as db:
        total = db.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]
        rows = db.execute(
            "SELECT * FROM audit_log ORDER BY created_at DESC, id LIMIT ? OFFSET ?", [page_size, (page - 1) * page_size]
        ).fetchall()
    items = []
    for r in rows:
        d = dict(r)
        d["detail"] = json.loads(d.pop("detail_json"))
        items.append(d)
    return {"items": items, "total": total, "page": page, "page_size": page_size}
