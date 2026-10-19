"""Enterprise features and model schema parity

Revision ID: 003_enterprise_features_and_model_parity
Revises: 002_add_booking_reference
Create Date: 2026-10-20 02:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003_enterprise_features_and_model_parity"
down_revision: Union[str, None] = "002_add_booking_reference"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. User profile and Google calendar integration fields
    op.add_column("users", sa.Column("phone", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("job_title", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("department", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("office_location", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("employee_code", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("bio", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("google_email", sa.String(256), nullable=True))
    op.add_column("users", sa.Column("google_connected_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("google_access_token_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("google_refresh_token_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("google_token_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("google_scopes", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("google_meet_url", sa.Text(), nullable=True))

    # 2. Event type extensions (payments, group/collective, assigned members, allowed locations)
    op.add_column("event_types", sa.Column("allowed_locations", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("event_types", sa.Column("booking_type", sa.String(64), server_default="one_on_one", nullable=False))
    op.add_column("event_types", sa.Column("assigned_user_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("event_types", sa.Column("price_amount", sa.Integer(), nullable=True))
    op.add_column("event_types", sa.Column("currency", sa.String(8), server_default="INR", nullable=False))
    op.add_column("event_types", sa.Column("payment_provider", sa.String(32), server_default="none", nullable=False))

    # 3. Bookings extensions (ad-hoc events, outcomes, follow-ups, payments, reschedule flag)
    op.alter_column("bookings", "event_type_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column("bookings", sa.Column("title", sa.String(256), nullable=True))
    op.add_column("bookings", sa.Column("is_rescheduled", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("bookings", sa.Column("meeting_outcome", sa.String(64), nullable=True))
    op.add_column("bookings", sa.Column("meeting_notes", sa.Text(), nullable=True))
    op.add_column("bookings", sa.Column("payment_status", sa.String(32), server_default="free", nullable=False))
    op.add_column("bookings", sa.Column("payment_amount", sa.Integer(), nullable=True))
    op.add_column("bookings", sa.Column("payment_currency", sa.String(8), server_default="INR", nullable=True))
    op.add_column("bookings", sa.Column("payment_id", sa.String(128), nullable=True))
    op.add_column("bookings", sa.Column("payment_order_id", sa.String(128), nullable=True))
    op.add_column("bookings", sa.Column("followup_required", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("bookings", sa.Column("followup_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("followup_notes", sa.Text(), nullable=True))
    op.add_column("bookings", sa.Column("followup_status", sa.String(32), server_default="pending", nullable=False))
    op.add_column("bookings", sa.Column("followup_priority", sa.String(32), server_default="medium", nullable=False))
    op.add_column("bookings", sa.Column("outcome_updated_at", sa.DateTime(timezone=True), nullable=True))

    # 4. Routing forms table
    op.create_table(
        "routing_forms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("slug", sa.String(128), unique=True, nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("fields", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("rules", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("fallback_action", sa.String(32), server_default="event_type", nullable=False),
        sa.Column("fallback_target", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_routing_forms_owner_user_id", "routing_forms", ["owner_user_id"])
    op.create_index("ix_routing_forms_slug", "routing_forms", ["slug"], unique=True)

    # 5. System settings table (organization white-labeling & branding)
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(128), primary_key=True, nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
    )

    # 6. Webhooks and delivery logs
    op.create_table(
        "webhooks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("secret", sa.String(128), nullable=False),
        sa.Column("events", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[\"booking.created\"]'::jsonb"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_webhooks_user_id", "webhooks", ["user_id"])

    op.create_table(
        "webhook_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("webhook_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("webhooks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("response_status_code", sa.Integer(), nullable=True),
        sa.Column("response_body", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), server_default="success", nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_webhook_logs_webhook_id", "webhook_logs", ["webhook_id"])

    # 7. Ensure PostgreSQL anti-double-booking exclusion constraint exists
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'excl_booking_employee_timeslot'
            ) THEN
                ALTER TABLE bookings
                ADD CONSTRAINT excl_booking_employee_timeslot
                EXCLUDE USING gist (
                    employee_id WITH =,
                    tstzrange(start_time, end_time) WITH &&
                ) WHERE (status = 'confirmed');
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.drop_index("ix_webhook_logs_webhook_id", table_name="webhook_logs")
    op.drop_table("webhook_logs")

    op.drop_index("ix_webhooks_user_id", table_name="webhooks")
    op.drop_table("webhooks")

    op.drop_table("system_settings")

    op.drop_index("ix_routing_forms_slug", table_name="routing_forms")
    op.drop_index("ix_routing_forms_owner_user_id", table_name="routing_forms")
    op.drop_table("routing_forms")

    for col in [
        "outcome_updated_at", "followup_priority", "followup_status", "followup_notes",
        "followup_date", "followup_required", "payment_order_id", "payment_id",
        "payment_currency", "payment_amount", "payment_status", "meeting_notes",
        "meeting_outcome", "is_rescheduled", "title"
    ]:
        op.drop_column("bookings", col)
    op.alter_column("bookings", "event_type_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)

    for col in [
        "payment_provider", "currency", "price_amount", "assigned_user_ids",
        "booking_type", "allowed_locations"
    ]:
        op.drop_column("event_types", col)

    for col in [
        "google_meet_url", "google_scopes", "google_token_expires_at",
        "google_refresh_token_encrypted", "google_access_token_encrypted",
        "google_connected_at", "google_email", "bio", "employee_code",
        "office_location", "department", "job_title", "phone"
    ]:
        op.drop_column("users", col)
