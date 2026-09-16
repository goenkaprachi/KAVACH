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

    # Database - Defaults to local SQLite for instant zero-friction development/demo,
    # or connects to Aiven for PostgreSQL when configured in .env.
    DATABASE_URL: str = "sqlite+aiosqlite:///./kavach.db"
    DATABASE_POOLED_URL: str | None = None
    DATABASE_SSL_CA_PATH: str | None = None

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

    # Email
    BREVO_API_KEY: str | None = None
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAIL_FROM: str = "no-reply@kavachconnect.infra"


settings = Settings()
