"""
Phase 13 — Custom Branding & White-Labeling
SystemSetting model: a simple org-wide key-value settings table.
Used to persist: logo_url, primary_color, company_name, booking_page_headline, support_email, etc.
"""
from sqlalchemy import Column, String, Text
from app.models.base import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(128), primary_key=True)
    value = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
