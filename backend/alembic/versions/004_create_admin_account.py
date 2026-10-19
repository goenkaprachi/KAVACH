"""Create initial administrator account via environment variables

Revision ID: 004_create_admin_account
Revises: 003_enterprise_features_and_model_parity
Create Date: 2026-10-20 02:25:00.000000

"""
import os
import uuid
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from passlib.context import CryptContext

revision: str = "004_create_admin_account"
down_revision: Union[str, None] = "003_enterprise_features_and_model_parity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def upgrade() -> None:
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "").strip()

    if not admin_email:
        raise RuntimeError(
            "ADMIN_EMAIL environment variable is missing. "
            "Migration 004_create_admin_account requires ADMIN_EMAIL and ADMIN_PASSWORD "
            "environment variables to create the administrator account securely. "
            "No default credentials are permitted."
        )

    if not admin_password:
        raise RuntimeError(
            "ADMIN_PASSWORD environment variable is missing. "
            "Migration 004_create_admin_account requires ADMIN_EMAIL and ADMIN_PASSWORD "
            "environment variables to create the administrator account securely. "
            "No default credentials are permitted."
        )

    hashed_password = pwd_context.hash(admin_password)
    bind = op.get_bind()

    # Check if a user with this email already exists
    res = bind.execute(
        sa.text("SELECT id FROM users WHERE email = :email"),
        {"email": admin_email}
    ).fetchone()

    if not res:
        user_id = str(uuid.uuid4())
        username_candidate = admin_email.split("@")[0].lower()
        # Verify username uniqueness
        u_check = bind.execute(
            sa.text("SELECT id FROM users WHERE username = :username"),
            {"username": username_candidate}
        ).fetchone()
        if u_check:
            username = f"{username_candidate}_{user_id[:6]}"
        else:
            username = username_candidate

        # Insert administrator user
        bind.execute(
            sa.text("""
                INSERT INTO users (
                    id, name, email, password_hash, role, status, timezone, username, created_at, updated_at
                ) VALUES (
                    :id, :name, :email, :password_hash, 'admin', 'active', 'Asia/Kolkata', :username, now(), now()
                )
            """),
            {
                "id": user_id,
                "name": "Administrator",
                "email": admin_email,
                "password_hash": hashed_password,
                "username": username,
            }
        )

        # Create default working hours availability schedule
        schedule_id = str(uuid.uuid4())
        bind.execute(
            sa.text("""
                INSERT INTO availability_schedules (
                    id, user_id, name, is_default, created_at
                ) VALUES (
                    :id, :user_id, 'Working Hours', true, now()
                )
            """),
            {"id": schedule_id, "user_id": user_id}
        )

        # Monday (1) to Friday (5), 9:00 AM to 5:00 PM
        for dow in range(1, 6):
            rule_id = str(uuid.uuid4())
            bind.execute(
                sa.text("""
                    INSERT INTO availability_rules (
                        id, schedule_id, day_of_week, start_time, end_time
                    ) VALUES (
                        :id, :schedule_id, :dow, '09:00:00', '17:00:00'
                    )
                """),
                {"id": rule_id, "schedule_id": schedule_id, "dow": dow}
            )


def downgrade() -> None:
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip()
    if admin_email:
        bind = op.get_bind()
        res = bind.execute(
            sa.text("SELECT id FROM users WHERE email = :email"),
            {"email": admin_email}
        ).fetchone()
        if res:
            user_id = res[0]
            bind.execute(
                sa.text("DELETE FROM users WHERE id = :id"),
                {"id": user_id}
            )
