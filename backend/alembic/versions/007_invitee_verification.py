"""Add booking_email_verifications table for invitee verification

Revision ID: 007_invitee_verification
Revises: 006_remove_webhooks_and_payments
Create Date: 2026-10-20 02:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "007_invitee_verification"
down_revision: Union[str, None] = "006_remove_webhooks_and_payments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "booking_email_verifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("email", sa.String(256), nullable=False),
        sa.Column("code", sa.String(16), nullable=False),
        sa.Column("token", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_booking_email_verifications_email", "booking_email_verifications", ["email"])
    op.create_index("ix_booking_email_verifications_code", "booking_email_verifications", ["code"])
    op.create_index("ix_booking_email_verifications_token", "booking_email_verifications", ["token"], unique=True)
    op.create_index("ix_booking_email_verifications_expires_at", "booking_email_verifications", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_booking_email_verifications_expires_at", table_name="booking_email_verifications")
    op.drop_index("ix_booking_email_verifications_token", table_name="booking_email_verifications")
    op.drop_index("ix_booking_email_verifications_code", table_name="booking_email_verifications")
    op.drop_index("ix_booking_email_verifications_email", table_name="booking_email_verifications")
    op.drop_table("booking_email_verifications")
