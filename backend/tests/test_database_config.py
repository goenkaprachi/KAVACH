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
