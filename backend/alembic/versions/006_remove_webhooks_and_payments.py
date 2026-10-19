"""Remove webhooks and payments tables

Revision ID: 006_remove_webhooks_and_payments
Revises: 005_login_rate_limiting
Create Date: 2026-10-20 02:40:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = "006_remove_webhooks_and_payments"
down_revision: Union[str, None] = "005_login_rate_limiting"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safely drop webhook and payment tables using DROP TABLE IF EXISTS CASCADE
    op.execute("DROP TABLE IF EXISTS webhook_logs CASCADE;")
    op.execute("DROP TABLE IF EXISTS webhooks CASCADE;")
    op.execute("DROP TABLE IF EXISTS payments CASCADE;")


def downgrade() -> None:
    pass
