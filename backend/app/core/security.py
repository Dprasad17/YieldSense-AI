import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

import bcrypt
import jwt
from fastapi import Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.app.core.config import settings
from backend.app.core.errors import AppError

security_bearer = HTTPBearer(auto_error=False)

# bcrypt only reads the first 72 bytes; longer passwords are rejected at registration.
BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def legacy_sha256_hash(password: str) -> str:
    """The pre-bcrypt scheme: SHA-256 of "<SECRET_KEY>:<password>". Kept only to migrate old records."""
    return hashlib.sha256(f"{settings.SECRET_KEY}:{password}".encode("utf-8")).hexdigest()


def verify_password(password: str, stored_hash: str, scheme: str) -> bool:
    if scheme == "bcrypt":
        try:
            return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
        except ValueError:
            return False
    if scheme == "sha256":
        return hmac.compare_digest(legacy_sha256_hash(password), stored_hash)
    return False


# Backwards-compatible alias used by older code paths.
get_password_hash = hash_password


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM], options={"require": ["exp", "sub"]})
    except jwt.ExpiredSignatureError:
        raise AppError(401, "Your session has expired. Please sign in again.", code="token_expired")
    except jwt.PyJWTError:
        raise AppError(401, "Could not validate credentials.")


def require_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)) -> dict:
    """Authenticated user. Role and active flag come from the user store, so changes apply immediately."""
    from backend.app.services.users import get_user  # local import: users imports this module

    if not credentials:
        raise AppError(401, "Not authenticated.")
    payload = _decode(credentials.credentials)
    stored = get_user(str(payload["sub"]))
    if not stored:
        raise AppError(401, "Account no longer exists.")
    if not stored.get("active", True):
        raise AppError(403, "This account has been deactivated.", code="account_inactive")
    return {
        "username": stored["username"],
        "role": stored["role"],
        "email": stored["email"],
        "full_name": stored.get("full_name") or stored["username"],
    }


def require_roles(*roles: str) -> Callable[..., dict]:
    """Dependency factory: allows the request only if the user's role is in `roles`."""
    allowed = {r.lower() for r in roles}

    def checker(user: dict = Security(require_user)) -> dict:
        if user["role"].lower() not in allowed:
            raise AppError(403, "Your role doesn't have access to this resource.")
        return user

    return checker


# Mirrors frontend/src/auth/permissions.ts
require_agronomist = require_roles("Agronomist", "Admin")
require_admin = require_roles("Admin")


def is_privileged(user: dict) -> bool:
    return user["role"].lower() in ("agronomist", "admin")
