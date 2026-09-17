import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class FormField(BaseModel):
    id: str
    label: str
    type: str = "select"  # text | select | radio | textarea
    required: bool = True
    options: Optional[List[str]] = None


class RouteCondition(BaseModel):
    field_id: str
    operator: str = "equals"  # equals | not_equals | contains
    value: Any


class RouteRule(BaseModel):
    id: str
    name: Optional[str] = None
    conditions: List[RouteCondition]
    action: str = "event_type"  # event_type | custom_url
    target_slug: Optional[str] = None
    target_owner_username: Optional[str] = None
    target_url: Optional[str] = None


class RoutingFormBase(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    slug: str = Field(min_length=1, max_length=128)
    description: Optional[str] = None
    is_active: bool = True
    fields: List[Dict[str, Any]] = []
    rules: List[Dict[str, Any]] = []
    fallback_action: str = "event_type"  # event_type | custom_url
    fallback_target: Optional[str] = None


class RoutingFormCreate(RoutingFormBase):
    pass


class RoutingFormUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    fields: Optional[List[Dict[str, Any]]] = None
    rules: Optional[List[Dict[str, Any]]] = None
    fallback_action: Optional[str] = None
    fallback_target: Optional[str] = None


class RoutingFormResponse(RoutingFormBase):
    id: uuid.UUID
    owner_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RoutingFormPublicResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str] = None
    fields: List[Dict[str, Any]]
    owner_name: str
    owner_username: str

    class Config:
        from_attributes = True


class RoutingFormEvaluateRequest(BaseModel):
    answers: Dict[str, Any]
    invitee_name: Optional[str] = None
    invitee_email: Optional[str] = None


class RoutingFormEvaluateResponse(BaseModel):
    action: str  # redirect_event_type | redirect_url
    target_url: str
    matched_rule_id: Optional[str] = None
    message: Optional[str] = None
