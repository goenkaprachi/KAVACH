import pytest
from pydantic import ValidationError
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from app.core.config import Settings
from app.models.booking import Booking


def test_sqlite_database_url_rejected():
    with pytest.raises(ValidationError) as exc_info:
        Settings(DATABASE_URL="sqlite+aiosqlite:///./kavach.db")
    assert "SQLite is not supported" in str(exc_info.value)


def test_empty_database_url_rejected():
    with pytest.raises(ValidationError) as exc_info:
        Settings(DATABASE_URL="")
    assert "DATABASE_URL is missing" in str(exc_info.value)


def test_non_postgresql_scheme_rejected():
    with pytest.raises(ValidationError) as exc_info:
        Settings(DATABASE_URL="mysql+pymysql://user:pass@localhost/db")
    assert "DATABASE_URL must be a PostgreSQL connection string" in str(exc_info.value)


def test_postgresql_scheme_normalized():
    s = Settings(DATABASE_URL="postgresql://user:pass@localhost:5432/kavach")
    assert s.DATABASE_URL.startswith("postgresql+asyncpg://")


def test_booking_model_exclusion_constraint():
    exclude_constraints = [
        arg for arg in Booking.__table_args__
        if isinstance(arg, ExcludeConstraint)
    ]
    assert len(exclude_constraints) == 1
    c = exclude_constraints[0]
    assert c.name == "excl_booking_employee_timeslot"
    assert c.using == "gist"


def test_cors_origins_fallback_to_localhost_when_unset():
    s = Settings(
        DATABASE_URL="postgresql://user:pass@localhost:5432/kavach",
        CORS_ORIGINS=None,
    )
    assert s.CORS_ORIGINS == ["http://localhost:5173", "http://127.0.0.1:5173"]


def test_cors_origins_comma_separated_parsing():
    s = Settings(
        DATABASE_URL="postgresql://user:pass@localhost:5432/kavach",
        CORS_ORIGINS="https://kavach.live, https://admin.kavach.live",
    )
    assert s.CORS_ORIGINS == ["https://kavach.live", "https://admin.kavach.live"]


def test_cors_origins_filters_out_wildcard():
    s = Settings(
        DATABASE_URL="postgresql://user:pass@localhost:5432/kavach",
        CORS_ORIGINS="*, https://kavach.live",
    )
    assert "*" not in s.CORS_ORIGINS
    assert s.CORS_ORIGINS == ["https://kavach.live"]


def test_cors_middleware_no_wildcard():
    from app.main import app
    for middleware in app.user_middleware:
        if middleware.cls.__name__ == "CORSMiddleware":
            allow_origins = middleware.kwargs.get("allow_origins", [])
            assert "*" not in allow_origins
            break


def test_empty_jwt_secret_rejected():
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            DATABASE_URL="postgresql://user:pass@localhost:5432/kavach",
            JWT_SECRET="",
            ENCRYPTION_KEY="dGhpcy1pcy1hLXNhbXBsZS1mZXJuZXQta2V5LTMyYnl0ZXM=",
        )
    assert "JWT_SECRET environment variable is missing" in str(exc_info.value)


def test_empty_encryption_key_rejected():
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            DATABASE_URL="postgresql://user:pass@localhost:5432/kavach",
            JWT_SECRET="valid_secret_key_12345",
            ENCRYPTION_KEY="",
        )
    assert "ENCRYPTION_KEY environment variable is missing" in str(exc_info.value)


def test_valid_secrets_accepted():
    s = Settings(
        DATABASE_URL="postgresql://user:pass@localhost:5432/kavach",
        JWT_SECRET="my_custom_jwt_secret_123",
        ENCRYPTION_KEY="dGhpcy1pcy1hLXNhbXBsZS1mZXJuZXQta2V5LTMyYnl0ZXM=",
    )
    assert s.JWT_SECRET == "my_custom_jwt_secret_123"
    assert s.ENCRYPTION_KEY == "dGhpcy1pcy1hLXNhbXBsZS1mZXJuZXQta2V5LTMyYnl0ZXM="


def test_migration_004_requires_admin_credentials(monkeypatch):
    import importlib.util
    from pathlib import Path

    migration_path = (
        Path(__file__).resolve().parent.parent / "alembic" / "versions" / "004_create_admin_account.py"
    )
    spec = importlib.util.spec_from_file_location("migration_004", migration_path)
    mig_004 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mig_004)

    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        mig_004.upgrade()
    assert "ADMIN_EMAIL environment variable is missing" in str(exc_info.value)

    monkeypatch.setenv("ADMIN_EMAIL", "admin@company.com")
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    with pytest.raises(RuntimeError) as exc_info:
        mig_004.upgrade()
    assert "ADMIN_PASSWORD environment variable is missing" in str(exc_info.value)


