from typing import List
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

    # Security
    JWT_SECRET: str = "kavach_connect_insecure_default_secret_key_change_me_12345"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENCRYPTION_KEY: str = "dGhpcy1pcy1hLXNhbXBsZS1mZXJuZXQta2V5LTMyYnl0ZXM="

    # CORS
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # External Provider Defaults
    JITSI_BASE_URL: str = "https://meet.jit.si"
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:5174/auth/google/callback"

    # Email
    BREVO_API_KEY: str | None = None
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAIL_FROM: str = "no-reply@kavachconnect.infra"


settings = Settings()
