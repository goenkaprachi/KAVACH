"""Add unique booking_reference code to bookings

Revision ID: 002_add_booking_reference
Revises: 001_initial_schema
Create Date: 2026-09-16 21:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002_add_booking_reference"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("booking_reference", sa.String(20), nullable=True))

    # Backfill any existing rows with a unique short reference code before
    # enforcing NOT NULL + UNIQUE (KV- + 8 random base32-ish chars).
    op.execute(
        """
        UPDATE bookings
        SET booking_reference = 'KV-' || upper(substr(md5(random()::text || id::text), 1, 8))
        WHERE booking_reference IS NULL
        """
    )

    op.alter_column("bookings", "booking_reference", nullable=False)
    op.create_index(
        "ix_bookings_booking_reference", "bookings", ["booking_reference"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_bookings_booking_reference", table_name="bookings")
    op.drop_column("bookings", "booking_reference")
