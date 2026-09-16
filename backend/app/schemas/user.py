import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class EmployeeCreateRequest(BaseModel):
    name: str
    email: EmailStr
    role: str = "employee"  # employee | admin
    username: Optional[str] = None
    timezone: str = "Asia/Kolkata"


class EmployeeUpdateRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None  # employee | admin
    status: Optional[str] = None  # pending | active | deactivated
    timezone: Optional[str] = None


class EmployeeResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: str
    status: str
    timezone: str
    username: str
    avatar_url: Optional[str] = None
    invited_by: Optional[uuid.UUID] = None
    invite_token: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    booking_count: Optional[int] = 0
    has_availability: Optional[bool] = False

    class Config:
        from_attributes = True


class EmployeePublicResponse(BaseModel):
    name: str
    username: str
    timezone: str
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True
