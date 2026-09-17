import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CustomQuestion(BaseModel):
    id: str
    label: str
    type: str = "text"  # text | select | textarea | phone
    required: bool = False
    options: Optional[List[str]] = None


class EventTypeBase(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    slug: str = Field(min_length=1, max_length=128)
    description: Optional[str] = None
    duration_minutes: int = Field(default=30, gt=0)
    location_type: str = "jitsi"  # jitsi | google_meet | zoom | microsoft_teams | whereby | phone | in_person | custom | attendee_choice
    location_detail: Optional[str] = None
    allowed_locations: Optional[List[Dict[str, Any]]] = None
    booking_type: str = "one_on_one"
    buffer_before_minutes: int = 0
    buffer_after_minutes: int = 0
    min_notice_minutes: int = 60
    max_days_in_advance: int = 30
    max_bookings_per_day: Optional[int] = None
    group_capacity: Optional[int] = None
    assigned_user_ids: Optional[List[str]] = []
    price_amount: Optional[int] = None
    currency: str = "INR"
    payment_provider: str = "none"
    custom_questions: List[Dict[str, Any]] = []
    is_active: bool = True
    schedule_id: Optional[uuid.UUID] = None


class EventTypeCreate(EventTypeBase):
    pass


class EventTypeUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    location_type: Optional[str] = None
    location_detail: Optional[str] = None
    allowed_locations: Optional[List[Dict[str, Any]]] = None
    booking_type: Optional[str] = None
    buffer_before_minutes: Optional[int] = None
    buffer_after_minutes: Optional[int] = None
    min_notice_minutes: Optional[int] = None
    max_days_in_advance: Optional[int] = None
    max_bookings_per_day: Optional[int] = None
    group_capacity: Optional[int] = None
    assigned_user_ids: Optional[List[str]] = None
    price_amount: Optional[int] = None
    currency: Optional[str] = None
    payment_provider: Optional[str] = None
    custom_questions: Optional[List[Dict[str, Any]]] = None
    is_active: Optional[bool] = None
    schedule_id: Optional[uuid.UUID] = None


class EventTypeResponse(EventTypeBase):
    id: uuid.UUID
    owner_user_id: Optional[uuid.UUID] = None
    owner_team_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EventTypePublicResponse(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    description: Optional[str] = None
    duration_minutes: int
    location_type: str
    location_detail: Optional[str] = None
    allowed_locations: Optional[List[Dict[str, Any]]] = None
    booking_type: str = "one_on_one"
    group_capacity: Optional[int] = None
    assigned_user_ids: Optional[List[str]] = []
    price_amount: Optional[int] = None
    currency: str = "INR"
    payment_provider: str = "none"
    custom_questions: List[Dict[str, Any]] = []
    owner_name: str
    owner_username: str
    owner_avatar_url: Optional[str] = None
    owner_timezone: str
    min_notice_minutes: int = 60
    max_days_in_advance: int = 30
    buffer_before_minutes: int = 0
    buffer_after_minutes: int = 0
    max_bookings_per_day: Optional[int] = None

    class Config:
        from_attributes = True
