"""Add booking_rate_limits table for public booking rate limiting

Revision ID: 008_booking_rate_limiting
Revises: 007_invitee_verification
Create Date: 2026-10-20 03:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "008_booking_rate_limiting"
down_revision: Union[str, None] = "007_invitee_verification"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "booking_rate_limits" not in insp.get_table_names():
        op.create_table(
            "booking_rate_limits",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("key", sa.String(256), nullable=False),
            sa.Column("count", sa.Integer(), server_default="1", nullable=False),
            sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_request_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_booking_rate_limits_key", "booking_rate_limits", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_booking_rate_limits_key", table_name="booking_rate_limits")
    op.drop_table("booking_rate_limits")
