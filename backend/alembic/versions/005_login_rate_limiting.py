"""Add login_rate_limits table for authentication rate limiting

Revision ID: 005_login_rate_limiting
Revises: 004_create_admin_account
Create Date: 2026-10-20 02:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005_login_rate_limiting"
down_revision: Union[str, None] = "004_create_admin_account"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "login_rate_limits" not in insp.get_table_names():
        op.create_table(
            "login_rate_limits",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
            sa.Column("key", sa.String(256), nullable=False, unique=True),
            sa.Column("failed_attempts", sa.Integer(), server_default="0", nullable=False),
            sa.Column("first_failed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_failed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_login_rate_limits_key", "login_rate_limits", ["key"])
        op.create_index("ix_login_rate_limits_locked_until", "login_rate_limits", ["locked_until"])


def downgrade() -> None:
    op.drop_index("ix_login_rate_limits_locked_until", table_name="login_rate_limits")
    op.drop_index("ix_login_rate_limits_key", table_name="login_rate_limits")
    op.drop_table("login_rate_limits")
