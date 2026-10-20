"""Switch from Google Calendar/Meet to Zoho Calendar and Zoho Meeting

Revision ID: 009_zoho_calendar_and_meeting
Revises: 008_booking_rate_limiting
Create Date: 2026-10-20 10:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "009_zoho_calendar_and_meeting"
down_revision: Union[str, None] = "008_booking_rate_limiting"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    def add_col_if_missing(table_name: str, col: sa.Column):
        cols = {c["name"] for c in insp.get_columns(table_name)}
        if col.name not in cols:
            op.add_column(table_name, col)

    # 1. Add Zoho columns to users
    add_col_if_missing("users", sa.Column("zoho_email", sa.String(256), nullable=True))
    add_col_if_missing("users", sa.Column("zoho_connected_at", sa.DateTime(timezone=True), nullable=True))
    add_col_if_missing("users", sa.Column("zoho_access_token_encrypted", sa.Text(), nullable=True))
    add_col_if_missing("users", sa.Column("zoho_refresh_token_encrypted", sa.Text(), nullable=True))
    add_col_if_missing("users", sa.Column("zoho_token_expires_at", sa.DateTime(timezone=True), nullable=True))
    add_col_if_missing("users", sa.Column("zoho_scopes", sa.Text(), nullable=True))
    add_col_if_missing("users", sa.Column("zoho_calendar_id", sa.String(256), nullable=True))
    add_col_if_missing("users", sa.Column("zoho_meeting_zsoid", sa.String(64), nullable=True))
    add_col_if_missing("users", sa.Column("zoho_meeting_zuid", sa.String(64), nullable=True))
    add_col_if_missing("users", sa.Column("zoho_meet_url", sa.Text(), nullable=True))

    # 2. Add external_calendar_event_id to bookings
    add_col_if_missing("bookings", sa.Column("external_calendar_event_id", sa.Text(), nullable=True))

    # 3. Drop deprecated Google columns from users if they exist
    user_cols = {c["name"] for c in insp.get_columns("users")}
    for col in [
        "google_email",
        "google_connected_at",
        "google_access_token_encrypted",
        "google_refresh_token_encrypted",
        "google_token_expires_at",
        "google_scopes",
        "google_meet_url",
    ]:
        if col in user_cols:
            op.drop_column("users", col)

    # 4. Migrate existing google_meet references to zoho_meeting
    op.execute("UPDATE meeting_provider_configs SET provider = 'zoho_meeting' WHERE provider = 'google_meet'")
    op.execute("UPDATE bookings SET meeting_provider = 'zoho_meeting' WHERE meeting_provider = 'google_meet'")
    op.execute("UPDATE event_types SET location_type = 'zoho_meeting' WHERE location_type = 'google_meet'")


def downgrade() -> None:
    op.drop_column("bookings", "external_calendar_event_id")

    # Add back google columns
    op.add_column("users", sa.Column("google_email", sa.String(256), nullable=True))
    op.add_column("users", sa.Column("google_connected_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("google_access_token_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("google_refresh_token_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("google_token_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("google_scopes", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("google_meet_url", sa.Text(), nullable=True))

    # Drop zoho columns
    for col in [
        "zoho_email",
        "zoho_connected_at",
        "zoho_access_token_encrypted",
        "zoho_refresh_token_encrypted",
        "zoho_token_expires_at",
        "zoho_scopes",
        "zoho_calendar_id",
        "zoho_meeting_zsoid",
        "zoho_meeting_zuid",
        "zoho_meet_url",
    ]:
        op.drop_column("users", col)

    op.execute("UPDATE meeting_provider_configs SET provider = 'google_meet' WHERE provider = 'zoho_meeting'")
    op.execute("UPDATE bookings SET meeting_provider = 'google_meet' WHERE meeting_provider = 'zoho_meeting'")
    op.execute("UPDATE event_types SET location_type = 'google_meet' WHERE location_type = 'zoho_meeting'")
