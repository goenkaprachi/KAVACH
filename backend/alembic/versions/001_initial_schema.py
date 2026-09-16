"""Initial schema with exclusion constraint

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-09-14 23:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enable required PostgreSQL extensions
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
    op.execute('CREATE EXTENSION IF NOT EXISTS "btree_gist";')

    # 2. Users table
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), unique=True, nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=True),
        sa.Column("role", sa.String(32), server_default="employee", nullable=False),
        sa.Column("status", sa.String(32), server_default="pending", nullable=False),
        sa.Column("timezone", sa.String(64), server_default="Asia/Kolkata", nullable=False),
        sa.Column("username", sa.String(64), unique=True, nullable=False),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("invite_token", postgresql.UUID(as_uuid=True), unique=True, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_username", "users", ["username"])

    # 3. Teams and team_members
    op.create_table(
        "teams",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "team_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("team_id", "user_id", name="uq_team_members_team_user"),
    )

    # 4. Availability schedules, rules, overrides
    op.create_table(
        "availability_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), server_default="Working Hours", nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_availability_schedules_user_id", "availability_schedules", ["user_id"])

    op.create_table(
        "availability_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("availability_schedules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day_of_week", sa.SmallInteger(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_availability_rules_day_of_week"),
    )
    op.create_index("ix_availability_rules_schedule_id", "availability_rules", ["schedule_id"])

    op.create_table(
        "availability_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("availability_schedules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("override_date", sa.Date(), nullable=False),
        sa.Column("is_unavailable", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.UniqueConstraint("schedule_id", "override_date", name="uq_availability_overrides_schedule_date"),
    )
    op.create_index("ix_availability_overrides_schedule_id", "availability_overrides", ["schedule_id"])

    # 5. Event types
    op.create_table(
        "event_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("owner_team_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=True),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("availability_schedules.id", ondelete="SET NULL"), nullable=True),
        sa.Column("slug", sa.String(128), nullable=False),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), server_default="30", nullable=False),
        sa.Column("location_type", sa.String(64), server_default="jitsi", nullable=False),
        sa.Column("location_detail", sa.Text(), nullable=True),
        sa.Column("booking_type", sa.String(64), server_default="one_on_one", nullable=False),
        sa.Column("buffer_before_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("buffer_after_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("min_notice_minutes", sa.Integer(), server_default="60", nullable=False),
        sa.Column("max_days_in_advance", sa.Integer(), server_default="30", nullable=False),
        sa.Column("max_bookings_per_day", sa.Integer(), nullable=True),
        sa.Column("group_capacity", sa.Integer(), nullable=True),
        sa.Column("custom_questions", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("owner_user_id IS NOT NULL OR owner_team_id IS NOT NULL", name="ck_event_types_owner"),
        sa.UniqueConstraint("owner_user_id", "slug", name="uq_event_types_owner_slug"),
    )
    op.create_index("ix_event_types_owner_user_id", "event_types", ["owner_user_id"])

    # 6. Calendar connections
    op.create_table(
        "calendar_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(64), server_default="google", nullable=False),
        sa.Column("access_token_encrypted", sa.Text(), nullable=False),
        sa.Column("refresh_token_encrypted", sa.Text(), nullable=False),
        sa.Column("calendar_id", sa.String(256), server_default="primary", nullable=False),
        sa.Column("sync_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_calendar_connections_user_id", "calendar_connections", ["user_id"])

    # 7. Meeting provider configs
    op.create_table(
        "meeting_provider_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("provider", sa.String(64), unique=True, nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("credentials_encrypted", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("configured_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # 8. Bookings table with Exclusion Constraint
    op.create_table(
        "bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("event_type_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("event_types.id"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), server_default="confirmed", nullable=False),
        sa.Column("meeting_provider", sa.String(64), nullable=False),
        sa.Column("meeting_join_url", sa.Text(), nullable=True),
        sa.Column("meeting_host_url", sa.Text(), nullable=True),
        sa.Column("external_meeting_ref", sa.Text(), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("cancelled_by", sa.String(32), nullable=True),
        sa.Column("rescheduled_from_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bookings.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_bookings_employee_id", "bookings", ["employee_id"])
    op.create_index("ix_bookings_start_time", "bookings", ["start_time"])
    op.create_index("ix_bookings_end_time", "bookings", ["end_time"])

    # Core anti-double-booking PostgreSQL exclusion constraint:
    op.execute("""
        ALTER TABLE bookings
        ADD CONSTRAINT excl_booking_employee_timeslot
        EXCLUDE USING gist (
            employee_id WITH =,
            tstzrange(start_time, end_time) WITH &&
        ) WHERE (status = 'confirmed');
    """)

    # 9. Invitees table
    op.create_table(
        "invitees",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("custom_answers", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("cancellation_token", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_invitees_booking_id", "invitees", ["booking_id"])
    op.create_index("ix_invitees_email", "invitees", ["email"])
    op.create_index("ix_invitees_cancellation_token", "invitees", ["cancellation_token"])

    # 10. Notification templates & workflows
    op.create_table(
        "notification_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
    )

    op.create_table(
        "workflows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("event_type_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("event_types.id"), nullable=True),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("trigger_type", sa.String(64), nullable=False),
        sa.Column("offset_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("action_type", sa.String(32), server_default="email", nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("notification_templates.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )
    op.create_index("ix_workflows_owner_user_id", "workflows", ["owner_user_id"])

    op.create_table(
        "notifications_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflows.id"), nullable=True),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_notifications_log_booking_id", "notifications_log", ["booking_id"])

    # 11. Audit logs
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("notifications_log")
    op.drop_table("workflows")
    op.drop_table("notification_templates")
    op.drop_table("invitees")
    op.drop_table("bookings")
    op.drop_table("meeting_provider_configs")
    op.drop_table("calendar_connections")
    op.drop_table("event_types")
    op.drop_table("availability_overrides")
    op.drop_table("availability_rules")
    op.drop_table("availability_schedules")
    op.drop_table("team_members")
    op.drop_table("teams")
    op.drop_table("users")
