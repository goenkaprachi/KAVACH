import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class WebhookCreate(BaseModel):
    url: str = Field(..., min_length=7, max_length=2048)
    events: List[str] = Field(default=["booking.created"])
    is_active: bool = True


class WebhookUpdate(BaseModel):
    url: Optional[str] = Field(default=None, min_length=7, max_length=2048)
    events: Optional[List[str]] = None
    is_active: Optional[bool] = None


class WebhookResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    url: str
    secret: str
    events: List[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WebhookLogResponse(BaseModel):
    id: uuid.UUID
    webhook_id: uuid.UUID
    event: str
    payload: Dict[str, Any]
    response_status_code: Optional[int] = None
    response_body: Optional[str] = None
    status: str
    delivered_at: datetime

    class Config:
        from_attributes = True


class WebhookTestResponse(BaseModel):
    status_code: Optional[int] = None
    status: str
    message: str
    response_body: Optional[str] = None
