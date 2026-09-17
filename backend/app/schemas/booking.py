import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, EmailStr


class SlotResponse(BaseModel):
    start_time: datetime
    end_time: datetime
    formatted_time: str


class InviteeResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    timezone: str
    custom_answers: Dict[str, Any] = {}
    cancellation_token: uuid.UUID

    class Config:
        from_attributes = True


class BookingCreateRequest(BaseModel):
    event_type_id: uuid.UUID
    start_time: datetime  # Invitee picked start time (can be with offset)
    invitee_name: str
    invitee_email: EmailStr
    invitee_timezone: str = "UTC"
    custom_answers: Dict[str, Any] = {}
    notes: Optional[str] = None
    location_choice: Optional[str] = None


class CancelBookingRequest(BaseModel):
    reason: Optional[str] = None
    cancellation_token: Optional[uuid.UUID] = None  # Needed if invitee cancels without login


class RescheduleBookingRequest(BaseModel):
    new_start_time: datetime
    reason: Optional[str] = None
    cancellation_token: Optional[uuid.UUID] = None  # Needed if invitee reschedules without login


class InternalBookingCreateRequest(BaseModel):
    title: str
    start_time: datetime
    duration_minutes: int = 30
    colleague_ids: List[uuid.UUID] = []
    guest_emails: List[EmailStr] = []
    meeting_provider: str = "jitsi"
    location_detail: Optional[str] = None
    notes: Optional[str] = None


class BookingResponse(BaseModel):
    id: uuid.UUID
    booking_reference: str
    event_type_id: Optional[uuid.UUID] = None
    title: Optional[str] = None
    employee_id: uuid.UUID
    start_time: datetime
    end_time: datetime
    status: str
    meeting_provider: str
    meeting_join_url: Optional[str] = None
    meeting_host_url: Optional[str] = None
    external_meeting_ref: Optional[str] = None
    cancellation_reason: Optional[str] = None
    cancelled_by: Optional[str] = None
    rescheduled_from_id: Optional[uuid.UUID] = None
    is_rescheduled: bool = False
    meeting_outcome: Optional[str] = None
    meeting_notes: Optional[str] = None
    followup_required: bool = False
    followup_date: Optional[datetime] = None
    followup_notes: Optional[str] = None
    followup_status: str = "pending"
    followup_priority: str = "medium"
    outcome_updated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    invitees: List[InviteeResponse] = []
    event_type_title: Optional[str] = None
    event_type_slug: Optional[str] = None
    employee_name: Optional[str] = None
    employee_username: Optional[str] = None
    employee_email: Optional[str] = None

    class Config:
        from_attributes = True


class UpdateBookingOutcomeRequest(BaseModel):
    meeting_outcome: Optional[str] = None
    meeting_notes: Optional[str] = None
    followup_required: bool = False
    followup_date: Optional[datetime] = None
    followup_notes: Optional[str] = None
    followup_priority: str = "medium"
    followup_status: str = "pending"


class UpdateFollowupStatusRequest(BaseModel):
    followup_status: str


class UpdateInviteeRequest(BaseModel):
    invitee_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    timezone: Optional[str] = None
    notes: Optional[str] = None
    custom_answers: Optional[Dict[str, Any]] = None



class BookingAuditLogItem(BaseModel):
    id: uuid.UUID
    action: str
    actor_type: str
    actor_name: Optional[str] = None
    description: str
    metadata: Dict[str, Any] = {}
    created_at: datetime

    class Config:
        from_attributes = True
