from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
import json
import os
from backend.app.core.security import (
    create_access_token,
    get_password_hash,
    verify_password,
    get_current_user
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

DB_FILE = os.path.join(os.path.dirname(__file__), "users_db.json")

def load_users():
    if not os.path.exists(DB_FILE):
        default_users = {
            "admin": {
                "username": "admin",
                "email": "admin@yieldsense.ai",
                "hashed_password": get_password_hash("admin123"),
                "role": "Admin",
                "full_name": "System Administrator"
            },
            "farmer": {
                "username": "farmer",
                "email": "farmer@yieldsense.ai",
                "hashed_password": get_password_hash("farmer123"),
                "role": "Farmer",
                "full_name": "Ramesh Kumar (Farmer)"
            }
        }
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(default_users, f, indent=4)
        return default_users
    
    with open(DB_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

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

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest):
    users_db = load_users()
    user = users_db.get(request.username.lower())
    if not user or not verify_password(request.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
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
        "email": user["email"]
    }

@router.post("/register", response_model=TokenResponse)
def register(request: RegisterRequest):
    users_db = load_users()
    if request.username.lower() in users_db:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed = get_password_hash(request.password)
    new_user = {
        "username": request.username,
        "email": request.email,
        "hashed_password": hashed,
        "role": request.role,
        "full_name": request.full_name or request.username
    }
    users_db[request.username.lower()] = new_user
    save_users(users_db)

    token = create_access_token({
        "sub": new_user["username"],
        "role": new_user["role"],
        "email": new_user["email"]
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "username": new_user["username"],
        "role": new_user["role"],
        "email": new_user["email"]
    }

@router.get("/me")
def read_current_user_profile(current_user: dict = Depends(get_current_user)):
    return {
        "status": "authenticated",
        "user": current_user
    }
