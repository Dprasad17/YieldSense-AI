import os

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def _load_env_files() -> None:
    """Load backend/.env then the repo-root .env. Real environment variables always win."""
    for path in (os.path.join(_ROOT, "backend", ".env"), os.path.join(_ROOT, ".env")):
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


_load_env_files()


def _csv_env(name: str, default: str) -> list[str]:
    return [v.strip() for v in os.getenv(name, default).split(",") if v.strip()]


class Settings:
    PROJECT_NAME: str = "YieldSense AI Platform"
    PROJECT_VERSION: str = "2.0.0"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "yieldsense_ai_super_secret_jwt_key_2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

    # Explicit browser origins allowed to call the API (comma-separated).
    CORS_ORIGINS: list[str] = _csv_env("CORS_ORIGINS", "http://localhost:5173")

    # PostgreSQL (SQLAlchemy URL) and MongoDB
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+psycopg://yieldsense:yieldsense@127.0.0.1:5432/yieldsense")
    MONGO_URL: str = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
    MONGO_DB: str = os.getenv("MONGO_DB", "yieldsense")

    # Reference dataset CSV (used by the seed script) and model artifacts
    DATASET_PATH: str = os.getenv("DATASET_PATH", os.path.join("datasets", "processed", "cleaned_crop_yield.csv"))
    MODEL_DIR: str = os.getenv("MODEL_DIR", os.path.join("models", "v2"))

    # Legacy stores, read only by scripts/migrate_legacy_stores.py
    LEGACY_SQLITE_PATH: str = os.path.join("backend", "data", "app.db")
    LEGACY_USERS_FILE: str = os.path.join("backend", "app", "api", "users_db.json")

    # Login throttling: failed attempts allowed per (IP, username) within the window.
    LOGIN_MAX_FAILURES: int = int(os.getenv("LOGIN_MAX_FAILURES", "5"))
    LOGIN_WINDOW_SECONDS: int = int(os.getenv("LOGIN_WINDOW_SECONDS", "60"))

    # Uploads
    UPLOAD_MAX_BYTES: int = int(os.getenv("UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)))
    UPLOAD_MAX_ROWS: int = int(os.getenv("UPLOAD_MAX_ROWS", "50000"))

    # Caches (Mongo TTL)
    WEATHER_CACHE_SECONDS: int = int(os.getenv("WEATHER_CACHE_SECONDS", "1800"))

    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")


settings = Settings()
