from datetime import datetime, timezone
import secrets
import uuid
from sqlalchemy import MetaData
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=naming_convention)


def generate_uuid():
    return uuid.uuid4()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I to avoid ambiguity


def generate_booking_reference() -> str:
    """Short, human-friendly unique code (e.g. KV-7F3QQ2R9) stored alongside the
    booking's UUID primary key, intended for external mapping/reference (e.g.
    support lookups, syncing with other systems) without exposing the raw UUID."""
    suffix = "".join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(8))
    return f"KV-{suffix}"
