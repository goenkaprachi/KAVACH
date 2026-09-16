import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import String, Text, Boolean, Integer, DateTime, ForeignKey, UniqueConstraint, CheckConstraint, Uuid, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, generate_uuid, utc_now


class EventType(Base):
    __tablename__ = "event_types"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=generate_uuid)
    owner_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    owner_team_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, index=True)
    schedule_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), ForeignKey("availability_schedules.id", ondelete="SET NULL"), nullable=True)
    slug: Mapped[str] = mapped_column(String(128), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    location_type: Mapped[str] = mapped_column(String(64), default="jitsi", nullable=False)  # jitsi | google_meet | zoom | microsoft_teams | whereby | phone | in_person | custom
    location_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    booking_type: Mapped[str] = mapped_column(String(64), default="one_on_one", nullable=False)  # one_on_one | round_robin | collective | group
    buffer_before_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    buffer_after_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    min_notice_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    max_days_in_advance: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    max_bookings_per_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    group_capacity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    custom_questions: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    owner = relationship("User", back_populates="event_types")
    schedule = relationship("AvailabilitySchedule")
    bookings = relationship("Booking", back_populates="event_type")

    __table_args__ = (
        CheckConstraint("owner_user_id IS NOT NULL OR owner_team_id IS NOT NULL", name="ck_event_types_owner"),
        UniqueConstraint("owner_user_id", "slug", name="uq_event_types_owner_slug"),
    )
