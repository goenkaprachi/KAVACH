import uuid
from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel


class MeetingProviderConfigUpdate(BaseModel):
    is_enabled: bool
    credentials: Dict[str, Any] = {}


class MeetingProviderConfigResponse(BaseModel):
    id: uuid.UUID
    provider: str
    is_enabled: bool
    is_configured: bool
    updated_at: datetime

    class Config:
        from_attributes = True
