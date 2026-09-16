import uuid
from datetime import datetime, time, date
from typing import List, Optional
from sqlalchemy import String, Text, Boolean, Integer, SmallInteger, Time, Date, DateTime, ForeignKey, UniqueConstraint, CheckConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, generate_uuid, utc_now


class AvailabilitySchedule(Base):
    __tablename__ = "availability_schedules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=generate_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(Text, default="Working Hours", nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User", back_populates="availability_schedules")
    rules = relationship("AvailabilityRule", back_populates="schedule", cascade="all, delete-orphan", order_by="AvailabilityRule.day_of_week, AvailabilityRule.start_time")
    overrides = relationship("AvailabilityOverride", back_populates="schedule", cascade="all, delete-orphan")


class AvailabilityRule(Base):
    __tablename__ = "availability_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=generate_uuid)
    schedule_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("availability_schedules.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0=Sunday, 6=Saturday
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    schedule = relationship("AvailabilitySchedule", back_populates="rules")

    __table_args__ = (
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_availability_rules_day_of_week"),
    )


class AvailabilityOverride(Base):
    __tablename__ = "availability_overrides"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=generate_uuid)
    schedule_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("availability_schedules.id", ondelete="CASCADE"), nullable=False, index=True)
    override_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_unavailable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    start_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    end_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)

    schedule = relationship("AvailabilitySchedule", back_populates="overrides")

    __table_args__ = (
        UniqueConstraint("schedule_id", "override_date", name="uq_availability_overrides_schedule_date"),
    )
