from typing import List, Any
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl, field_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    PROJECT_NAME: str = "Kavach Connect"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Database: PostgreSQL and Alembic only.
    # SQLite fallback is strictly prohibited.
    DATABASE_URL: str = ""
    DATABASE_POOLED_URL: str | None = None
    DATABASE_SSL_CA_PATH: str | None = None

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError(
                "DATABASE_URL is missing. The application requires a PostgreSQL database with Alembic migrations applied."
            )
        v = v.strip()
        if "sqlite" in v.lower():
            raise ValueError(
                "SQLite is not supported. The application requires PostgreSQL with Alembic migrations applied. SQLite fallback has been removed."
            )
        if not (v.startswith("postgresql://") or v.startswith("postgresql+asyncpg://")):
            raise ValueError(
                f"DATABASE_URL must be a PostgreSQL connection string (postgresql+asyncpg://... or postgresql://...). Got: {v[:20]}..."
            )
        if v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v

    @field_validator("DATABASE_POOLED_URL")
    @classmethod
    def validate_pooled_url(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if "sqlite" in v.lower():
                raise ValueError("SQLite is not supported for DATABASE_POOLED_URL. PostgreSQL is required.")
            if not (v.startswith("postgresql://") or v.startswith("postgresql+asyncpg://")):
                raise ValueError("DATABASE_POOLED_URL must be a PostgreSQL connection string.")
            if v.startswith("postgresql://"):
                v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v

    # Security: JWT_SECRET and ENCRYPTION_KEY must be provided via environment variables.
    # Hardcoded default secrets are removed.
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENCRYPTION_KEY: str = ""

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError(
                "JWT_SECRET environment variable is missing. A secure random secret key is required."
            )
        return v.strip()

    @field_validator("ENCRYPTION_KEY")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError(
                "ENCRYPTION_KEY environment variable is missing. A 32-byte url-safe base64 Fernet key is required."
            )
        return v.strip()

    # CORS: Read from environment (e.g. CORS_ORIGINS="https://app.kavach.live").
    # If unset, falls back to local frontend (localhost) only. No wildcards.
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str]:
        default_local = ["http://localhost:5173", "http://127.0.0.1:5173"]
        if v is None:
            return default_local
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return default_local
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    items = json.loads(v)
                    cleaned = [str(item).strip() for item in items if str(item).strip() and str(item).strip() != "*"]
                    return cleaned if cleaned else default_local
                except Exception:
                    pass
            origins = [o.strip() for o in v.split(",") if o.strip() and o.strip() != "*"]
            return origins if origins else default_local
        if isinstance(v, (list, tuple, set)):
            origins = [str(item).strip() for item in v if str(item).strip() and str(item).strip() != "*"]
            return origins if origins else default_local
        return default_local

    # External Provider Defaults
    JITSI_BASE_URL: str = "https://meet.jit.si"

    # Zoho Integration & DC Configuration (defaults to .in for Kavach, fully configurable)
    ZOHO_CLIENT_ID: str | None = None
    ZOHO_CLIENT_SECRET: str | None = None
    ZOHO_REDIRECT_URI: str = "http://localhost:5173/auth/zoho/callback"
    ZOHO_DC: str = "in"
    ZOHO_ACCOUNTS_URL: str | None = None
    ZOHO_CALENDAR_API_BASE: str | None = None
    ZOHO_MEETING_API_BASE: str | None = None

    @property
    def zoho_accounts_url(self) -> str:
        if self.ZOHO_ACCOUNTS_URL and self.ZOHO_ACCOUNTS_URL.strip():
            return self.ZOHO_ACCOUNTS_URL.strip().rstrip("/")
        dc = (self.ZOHO_DC or "in").strip().lstrip(".")
        return f"https://accounts.zoho.{dc}"

    @property
    def zoho_calendar_api_base(self) -> str:
        if self.ZOHO_CALENDAR_API_BASE and self.ZOHO_CALENDAR_API_BASE.strip():
            return self.ZOHO_CALENDAR_API_BASE.strip().rstrip("/")
        dc = (self.ZOHO_DC or "in").strip().lstrip(".")
        return f"https://calendar.zoho.{dc}"

    @property
    def zoho_meeting_api_base(self) -> str:
        if self.ZOHO_MEETING_API_BASE and self.ZOHO_MEETING_API_BASE.strip():
            return self.ZOHO_MEETING_API_BASE.strip().rstrip("/")
        dc = (self.ZOHO_DC or "in").strip().lstrip(".")
        return f"https://meeting.zoho.{dc}"

    # Email
    BREVO_API_KEY: str | None = None
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAIL_FROM: str = "no-reply@kavachconnect.infra"


settings = Settings()
