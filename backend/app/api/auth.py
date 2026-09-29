from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
import json
import os
from backend.app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
    require_user
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

DB_FILE = os.path.join(os.path.dirname(__file__), "users_db.json")

# Roles a user may pick for themselves at registration. Admin is granted by an admin only.
SELF_REGISTER_ROLES = {"Farmer", "Agronomist"}

DEMO_USERS = {
    "admin": ("admin123", "Admin", "admin@yieldsense.ai", "System Administrator"),
    "farmer": ("farmer123", "Farmer", "farmer@yieldsense.ai", "Ramesh Kumar"),
    "agronomist": ("agro123", "Agronomist", "agronomist@yieldsense.ai", "Dr. Sarah Jenkins"),
}

def _demo_user(username: str) -> dict:
    password, role, email, full_name = DEMO_USERS[username]
    return {
        "username": username,
        "email": email,
        "hashed_password": get_password_hash(password),
        "role": role,
        "full_name": full_name
    }

def load_users():
    users = {}
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r", encoding="utf-8") as f:
            users = json.load(f)

    # Seed any demo account that is missing, including into an existing DB
    missing = [u for u in DEMO_USERS if u not in users]
    if missing:
        for username in missing:
            users[username] = _demo_user(username)
        save_users(users)
    return users

def save_users(users_data):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(users_data, f, indent=4)

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "Farmer"
    full_name: str = ""

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    email: str
    full_name: str = ""

def _token_response(user: dict) -> dict:
    token = create_access_token({
        "sub": user["username"],
        "role": user["role"],
        "email": user["email"]
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user["username"],
        "role": user["role"],
        "email": user["email"],
        "full_name": user.get("full_name") or user["username"]
    }

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest):
    users_db = load_users()
    user = users_db.get(request.username.lower())
    if not user or not verify_password(request.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    return _token_response(user)

@router.post("/register", response_model=TokenResponse)
def register(request: RegisterRequest):
    users_db = load_users()
    if request.username.lower() in users_db:
        raise HTTPException(status_code=400, detail="Username already registered")
    if request.role not in SELF_REGISTER_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {sorted(SELF_REGISTER_ROLES)}")

    new_user = {
        "username": request.username,
        "email": request.email,
        "hashed_password": get_password_hash(request.password),
        "role": request.role,
        "full_name": request.full_name or request.username
    }
    users_db[request.username.lower()] = new_user
    save_users(users_db)
    return _token_response(new_user)

@router.get("/me")
def read_current_user_profile(current_user: dict = Depends(require_user)):
    stored = load_users().get(current_user["username"].lower(), {})
    return {
        "status": "authenticated",
        "user": {
            **current_user,
            "full_name": stored.get("full_name") or current_user["username"]
        }
    }
