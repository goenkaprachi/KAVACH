import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, Uuid, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, generate_uuid, utc_now


class RoutingForm(Base):
    __tablename__ = "routing_forms"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=generate_uuid)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    fields: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    rules: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    fallback_action: Mapped[str] = mapped_column(String(32), default="event_type", nullable=False)  # event_type | custom_url
    fallback_target: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    owner = relationship("User")
