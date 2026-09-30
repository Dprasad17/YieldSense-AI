from typing import Literal, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field, field_validator

from backend.app.core.config import settings
from backend.app.core.errors import ERROR_RESPONSES, RATE_LIMIT_RESPONSE, AppError
from backend.app.core.ratelimit import login_limiter
from backend.app.core.security import BCRYPT_MAX_BYTES, create_access_token, hash_password, require_user, verify_password
from backend.app.services.users import get_user, update_user, upsert_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"], responses=ERROR_RESPONSES)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=6)
    # Admin is granted by an admin only.
    role: Literal["Farmer", "Agronomist"] = "Farmer"
    full_name: str = Field("", max_length=80)

    @field_validator("password")
    @classmethod
    def fits_bcrypt(cls, v: str) -> str:
        if len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError(f"must be at most {BCRYPT_MAX_BYTES} bytes")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    username: str
    role: str
    email: str
    full_name: str


class SessionUser(BaseModel):
    username: str
    role: str
    email: str
    full_name: str


class NotificationPrefs(BaseModel):
    recommendations: bool = True
    alerts: bool = True
    weather: bool = True
    system: bool = True


class MeUser(SessionUser):
    notification_prefs: NotificationPrefs


class MeResponse(BaseModel):
    status: str
    user: MeUser


class ProfilePatch(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=80)
    email: Optional[EmailStr] = None
    notification_prefs: Optional[NotificationPrefs] = None


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def fits_bcrypt(cls, v: str) -> str:
        if len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError(f"must be at most {BCRYPT_MAX_BYTES} bytes")
        return v


def _token_response(user: dict) -> dict:
    token = create_access_token({"sub": user["username"], "role": user["role"], "email": user["email"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "username": user["username"],
        "role": user["role"],
        "email": user["email"],
        "full_name": user.get("full_name") or user["username"],
    }


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=TokenResponse, responses=RATE_LIMIT_RESPONSE)
def login(body: LoginRequest, request: Request):
    ip, username = _client_ip(request), body.username.strip().lower()
    wait = login_limiter.retry_after(ip, username)
    if wait:
        raise AppError(
            429,
            f"Too many sign-in attempts. Try again in {wait} seconds.",
            code="rate_limited",
            headers={"Retry-After": str(wait)},
        )

    user = get_user(username)
    scheme = (user or {}).get("hash_scheme", "bcrypt")
    if not user or not verify_password(body.password, user["hashed_password"], scheme):
        login_limiter.record_failure(ip, username)
        raise AppError(401, "Incorrect username or password.", code="invalid_credentials")
    if not user.get("active", True):
        raise AppError(403, "This account has been deactivated. Contact an administrator.", code="account_inactive")

    # Transparent migration: a legacy SHA-256 hash that just verified is replaced by bcrypt.
    if scheme != "bcrypt":
        user = {**user, "hashed_password": hash_password(body.password), "hash_scheme": "bcrypt"}
        upsert_user(user)

    login_limiter.reset(ip, username)
    return _token_response(user)


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest):
    if get_user(body.username):
        raise AppError(409, "That username is already taken.", code="username_taken")
    user = {
        "username": body.username,
        "email": body.email,
        "hashed_password": hash_password(body.password),
        "hash_scheme": "bcrypt",
        "role": body.role,
        "full_name": body.full_name or body.username,
        "active": True,
    }
    upsert_user(user)
    return _token_response(user)


def _me(username: str) -> dict:
    u = get_user(username)
    assert u is not None
    return {"status": "authenticated", "user": {k: u[k] for k in ("username", "role", "email", "full_name", "notification_prefs")}}


@router.get("/me", response_model=MeResponse)
def read_current_user_profile(user: dict = Depends(require_user)):
    return _me(user["username"])


@router.patch("/me", response_model=MeResponse)
def update_profile(body: ProfilePatch, user: dict = Depends(require_user)):
    """Edit your own name, email and notification preferences. Role changes are admin-only."""
    fields = body.model_dump(exclude_unset=True)
    if "notification_prefs" in fields and fields["notification_prefs"] is not None:
        fields["notification_prefs"] = dict(fields["notification_prefs"])
    update_user(user["username"], **fields)
    return _me(user["username"])


@router.post("/change-password", status_code=204, responses=RATE_LIMIT_RESPONSE)
def change_password(body: PasswordChange, request: Request, user: dict = Depends(require_user)):
    ip, username = _client_ip(request), user["username"].lower()
    wait = login_limiter.retry_after(ip, username)
    if wait:
        raise AppError(429, f"Too many attempts. Try again in {wait} seconds.", code="rate_limited", headers={"Retry-After": str(wait)})
    stored = get_user(username)
    assert stored is not None
    if not verify_password(body.current_password, stored["hashed_password"], stored.get("hash_scheme", "bcrypt")):
        login_limiter.record_failure(ip, username)
        raise AppError(400, "Your current password is incorrect.", code="wrong_password")
    if body.current_password == body.new_password:
        raise AppError(400, "Choose a password different from your current one.", code="same_password")
    update_user(username, hashed_password=hash_password(body.new_password), hash_scheme="bcrypt")
