import os


def _csv_env(name: str, default: str) -> list[str]:
    return [v.strip() for v in os.getenv(name, default).split(",") if v.strip()]


class Settings:
    PROJECT_NAME: str = "YieldSense AI Platform"
    PROJECT_VERSION: str = "1.0.0"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "yieldsense_ai_super_secret_jwt_key_2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

    # Explicit browser origins allowed to call the API (comma-separated).
    CORS_ORIGINS: list[str] = _csv_env("CORS_ORIGINS", "http://localhost:5173")

    # Data files (paths are relative to the repo root, where the API is started)
    DATASET_PATH: str = os.getenv("DATASET_PATH", os.path.join("datasets", "processed", "cleaned_crop_yield.csv"))
    DB_PATH: str = os.getenv("YIELDSENSE_DB_PATH", os.path.join("backend", "data", "app.db"))
    USERS_FILE: str = os.getenv(
        "YIELDSENSE_USERS_FILE", os.path.join(os.path.dirname(os.path.dirname(__file__)), "api", "users_db.json")
    )

    # Login throttling: failed attempts allowed per (IP, username) within the window.
    LOGIN_MAX_FAILURES: int = int(os.getenv("LOGIN_MAX_FAILURES", "5"))
    LOGIN_WINDOW_SECONDS: int = int(os.getenv("LOGIN_WINDOW_SECONDS", "60"))

    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")


settings = Settings()
