import uuid
from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field


class WorkflowBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    trigger_type: str = Field(default="before_event")  # before_event | after_event | on_creation | on_cancellation
    offset_minutes: int = Field(default=1440)  # minutes before or after event (e.g., 1440 = 24h, 60 = 1h, 15 = 15m)
    action_type: str = Field(default="email_attendee")  # email_attendee | email_host | email_both | email
    event_type_id: Optional[uuid.UUID] = None
    template_id: Optional[uuid.UUID] = None
    is_active: bool = True


class WorkflowCreate(WorkflowBase):
    pass


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    trigger_type: Optional[str] = None
    offset_minutes: Optional[int] = None
    action_type: Optional[str] = None
    event_type_id: Optional[uuid.UUID] = None
    template_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class WorkflowResponse(WorkflowBase):
    id: uuid.UUID
    owner_user_id: uuid.UUID
    event_type_title: Optional[str] = None

    class Config:
        from_attributes = True


class NotificationsLogResponse(BaseModel):
    id: uuid.UUID
    booking_id: uuid.UUID
    workflow_id: Optional[uuid.UUID] = None
    workflow_name: Optional[str] = None
    booking_title: Optional[str] = None
    recipient_email: Optional[str] = None
    channel: str
    status: str
    sent_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RunWorkflowsResult(BaseModel):
    processed_count: int
    sent_count: int
    failed_count: int
    details: List[str] = []
