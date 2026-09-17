import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, Index, Uuid, JSON, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, generate_uuid, generate_booking_reference, utc_now


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=generate_uuid)
    booking_reference: Mapped[str] = mapped_column(
        String(20), default=generate_booking_reference, unique=True, nullable=False, index=True
    )
    event_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), ForeignKey("event_types.id"), nullable=True, index=True)
    title: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="confirmed", nullable=False)  # confirmed | cancelled | completed | no_show
    meeting_provider: Mapped[str] = mapped_column(String(64), nullable=False)  # jitsi | google_meet | zoom | microsoft_teams | whereby | phone | in_person | custom
    meeting_join_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    meeting_host_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    external_meeting_ref: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cancellation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cancelled_by: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # employee | invitee
    rescheduled_from_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), ForeignKey("bookings.id"), nullable=True)
    is_rescheduled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    meeting_outcome: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    meeting_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payment_status: Mapped[str] = mapped_column(String(32), default="free", nullable=False)  # free | pending | paid | refunded
    payment_amount: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    payment_currency: Mapped[Optional[str]] = mapped_column(String(8), default="INR", nullable=True)
    payment_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    payment_order_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    followup_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    followup_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    followup_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    followup_status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    followup_priority: Mapped[str] = mapped_column(String(32), default="medium", nullable=False)
    outcome_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    event_type = relationship("EventType", back_populates="bookings")
    employee = relationship("User", back_populates="bookings")
    invitees = relationship("Invitee", back_populates="booking", cascade="all, delete-orphan")
    notifications_log = relationship("NotificationsLog", back_populates="booking", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_bookings_emp_time_status", "employee_id", "start_time", "end_time", "status"),
    )


class Invitee(Base):
    __tablename__ = "invitees"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=generate_uuid)
    booking_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    custom_answers: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    cancellation_token: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), default=generate_uuid, unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    booking = relationship("Booking", back_populates="invitees")
