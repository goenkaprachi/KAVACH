import uuid
from typing import Optional, List
from pydantic import BaseModel, EmailStr


class NotificationTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    subject: str
    body: str

    class Config:
        from_attributes = True


class NotificationTemplateUpdateRequest(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None


class SendTestEmailRequest(BaseModel):
    recipient_email: EmailStr
