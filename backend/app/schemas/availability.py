import uuid
from datetime import time, date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class AvailabilityRuleBase(BaseModel):
    day_of_week: int = Field(ge=0, le=6)  # 0=Sunday
    start_time: time
    end_time: time


class AvailabilityRuleCreate(AvailabilityRuleBase):
    pass


class AvailabilityRuleResponse(AvailabilityRuleBase):
    id: uuid.UUID
    schedule_id: uuid.UUID

    class Config:
        from_attributes = True


class AvailabilityOverrideBase(BaseModel):
    override_date: date
    is_unavailable: bool = True
    start_time: Optional[time] = None
    end_time: Optional[time] = None


class AvailabilityOverrideCreate(AvailabilityOverrideBase):
    pass


class AvailabilityOverrideResponse(AvailabilityOverrideBase):
    id: uuid.UUID
    schedule_id: uuid.UUID

    class Config:
        from_attributes = True


class AvailabilityScheduleCreate(BaseModel):
    name: str = "Working Hours"
    is_default: bool = True
    rules: List[AvailabilityRuleCreate] = []


class AvailabilityScheduleUpdate(BaseModel):
    name: Optional[str] = None
    is_default: Optional[bool] = None
    rules: Optional[List[AvailabilityRuleCreate]] = None


class AvailabilityScheduleResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    is_default: bool
    created_at: datetime
    rules: List[AvailabilityRuleResponse] = []
    overrides: List[AvailabilityOverrideResponse] = []

    class Config:
        from_attributes = True


class OutOfOfficeBookingPreviewItem(BaseModel):
    id: uuid.UUID
    title: str
    start_time: datetime
    end_time: datetime
    meeting_provider: Optional[str] = None
    invitee_names: List[str] = []
    invitee_emails: List[str] = []


class OutOfOfficePreviewResponse(BaseModel):
    date: date
    bookings_count: int
    bookings: List[OutOfOfficeBookingPreviewItem] = []


class MarkOutOfOfficeRequest(BaseModel):
    date: date
    custom_message: Optional[str] = None
    schedule_id: Optional[uuid.UUID] = None


class MarkOutOfOfficeResponse(BaseModel):
    date: date
    cancelled_bookings_count: int
    cancelled_booking_ids: List[uuid.UUID] = []
    message: str
    override_ids: List[uuid.UUID] = []

