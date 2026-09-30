"""User store on PostgreSQL. Returns plain dicts so callers stay storage-agnostic."""
from typing import Optional

from sqlalchemy import func, select

from backend.app.db.models import User
from backend.app.db.session import session_scope

ROLES = ("Farmer", "Agronomist", "Admin")

# Public demo accounts (seeded by scripts/seed.py).
DEMO_USERS = {
    "admin": ("admin123", "Admin", "admin@yieldsense.ai", "System Administrator"),
    "farmer": ("farmer123", "Farmer", "farmer@yieldsense.ai", "Ramesh Kumar"),
    "agronomist": ("agro123", "Agronomist", "agronomist@yieldsense.ai", "Dr. Sarah Jenkins"),
}

DEFAULT_NOTIFICATION_PREFS = {"recommendations": True, "alerts": True, "weather": True, "system": True}


def to_dict(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "full_name": u.full_name or u.username,
        "role": u.role,
        "hashed_password": u.hashed_password,
        "hash_scheme": u.hash_scheme,
        "active": u.active,
        "notification_prefs": {**DEFAULT_NOTIFICATION_PREFS, **(u.notification_prefs or {})},
    }


def get_user(username: str) -> Optional[dict]:
    with session_scope() as s:
        u = s.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))
        return to_dict(u) if u else None


def list_users() -> list[dict]:
    with session_scope() as s:
        return [to_dict(u) for u in s.scalars(select(User).order_by(User.username))]


def create_user(username: str, email: str, hashed_password: str, role: str, full_name: str, hash_scheme: str = "bcrypt") -> dict:
    with session_scope() as s:
        u = User(username=username, email=email, hashed_password=hashed_password, hash_scheme=hash_scheme, role=role, full_name=full_name or username, active=True, notification_prefs=dict(DEFAULT_NOTIFICATION_PREFS))
        s.add(u)
        s.flush()
        return to_dict(u)


def update_user(username: str, **fields) -> Optional[dict]:
    allowed = {"email", "full_name", "role", "hashed_password", "hash_scheme", "active", "notification_prefs"}
    with session_scope() as s:
        u = s.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))
        if not u:
            return None
        for k, v in fields.items():
            if k in allowed and v is not None:
                setattr(u, k, v)
        s.flush()
        return to_dict(u)


def upsert_user(user: dict) -> dict:
    """Compatibility helper: update an existing user from a dict, or create it."""
    if get_user(user["username"]):
        return update_user(user["username"], **{k: v for k, v in user.items() if k != "username"}) or user
    return create_user(user["username"], user["email"], user["hashed_password"], user.get("role", "Farmer"), user.get("full_name", ""), user.get("hash_scheme", "bcrypt"))


def load_users() -> dict:
    return {u["username"].lower(): u for u in list_users()}


def public_user(user: dict) -> dict:
    return {
        "username": user["username"],
        "email": user["email"],
        "full_name": user.get("full_name") or user["username"],
        "role": user["role"],
        "active": bool(user.get("active", True)),
    }


def user_id(username: str) -> Optional[int]:
    with session_scope() as s:
        return s.scalar(select(User.id).where(func.lower(User.username) == username.strip().lower()))
