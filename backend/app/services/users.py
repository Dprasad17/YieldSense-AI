"""JSON-file user store (backend/app/api/users_db.json). Thread-safe, cached by file mtime."""
import json
import os
import threading
from typing import Optional

from backend.app.core.config import settings
from backend.app.core.security import hash_password

ROLES = ("Farmer", "Agronomist", "Admin")

# Public demo accounts. Seeded into any store that lacks them.
DEMO_USERS = {
    "admin": ("admin123", "Admin", "admin@yieldsense.ai", "System Administrator"),
    "farmer": ("farmer123", "Farmer", "farmer@yieldsense.ai", "Ramesh Kumar"),
    "agronomist": ("agro123", "Agronomist", "agronomist@yieldsense.ai", "Dr. Sarah Jenkins"),
}

_lock = threading.RLock()
_cache: dict = {"mtime": None, "path": None, "users": {}}


def _path() -> str:
    return settings.USERS_FILE


def _normalize(user: dict) -> dict:
    """Fill fields added after the store was first created."""
    user.setdefault("active", True)
    # Records written before bcrypt carry a salted SHA-256 hex digest.
    user.setdefault("hash_scheme", "bcrypt" if str(user.get("hashed_password", "")).startswith("$2") else "sha256")
    user.setdefault("full_name", user.get("username", ""))
    return user


def _save(users: dict) -> None:
    path = _path()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=4)
    os.replace(tmp, path)
    _cache.update(mtime=os.path.getmtime(path), path=path, users=users)


def load_users() -> dict:
    with _lock:
        path = _path()
        users: dict = {}
        if os.path.exists(path):
            mtime = os.path.getmtime(path)
            if _cache["path"] == path and _cache["mtime"] == mtime:
                return _cache["users"]
            with open(path, "r", encoding="utf-8") as f:
                users = json.load(f)

        changed = False
        for username, (password, role, email, full_name) in DEMO_USERS.items():
            if username not in users:
                users[username] = {
                    "username": username,
                    "email": email,
                    "hashed_password": hash_password(password),
                    "hash_scheme": "bcrypt",
                    "role": role,
                    "full_name": full_name,
                    "active": True,
                }
                changed = True
        for key, user in users.items():
            before = dict(user)
            _normalize(user)
            changed = changed or before != user

        if changed or not os.path.exists(path):
            _save(users)
        else:
            _cache.update(mtime=os.path.getmtime(path), path=path, users=users)
        return users


def get_user(username: str) -> Optional[dict]:
    return load_users().get(username.strip().lower())


def upsert_user(user: dict) -> dict:
    with _lock:
        users = dict(load_users())
        users[user["username"].lower()] = _normalize(user)
        _save(users)
        return user


def public_user(user: dict) -> dict:
    return {
        "username": user["username"],
        "email": user["email"],
        "full_name": user.get("full_name") or user["username"],
        "role": user["role"],
        "active": bool(user.get("active", True)),
    }
