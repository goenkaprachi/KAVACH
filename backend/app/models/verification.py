import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, func, Uuid
from app.models.base import Base, generate_uuid, utc_now


class BookingEmailVerification(Base):
    __tablename__ = "booking_email_verifications"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=generate_uuid)
    email = Column(String(256), index=True, nullable=False)
    code = Column(String(16), index=True, nullable=False)
    token = Column(Uuid(as_uuid=True), default=generate_uuid, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), index=True, nullable=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
