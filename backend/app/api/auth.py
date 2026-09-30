from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field, field_validator

from backend.app.core.config import settings
from backend.app.core.errors import ERROR_RESPONSES, RATE_LIMIT_RESPONSE, AppError
from backend.app.core.ratelimit import login_limiter
from backend.app.core.security import BCRYPT_MAX_BYTES, create_access_token, hash_password, require_user, verify_password
from backend.app.services.users import get_user, upsert_user

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


class MeResponse(BaseModel):
    status: str
    user: SessionUser


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


@router.get("/me", response_model=MeResponse)
def read_current_user_profile(user: dict = Depends(require_user)):
    return {"status": "authenticated", "user": user}
