import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.models.webhook import Webhook, WebhookLog
from app.schemas.webhook import (
    WebhookCreate,
    WebhookUpdate,
    WebhookResponse,
    WebhookLogResponse,
    WebhookTestResponse,
)
from app.api.deps import require_employee
from app.services.webhook_service import webhook_service

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@router.get("", response_model=List[WebhookResponse])
async def list_webhooks(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Lists webhooks for current user (or all if admin)."""
    stmt = select(Webhook).order_by(Webhook.created_at.desc())
    if current_user.role != "admin":
        stmt = stmt.where(Webhook.user_id == current_user.id)

    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=WebhookResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    req: WebhookCreate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Creates a new webhook subscription."""
    webhook = Webhook(
        user_id=current_user.id,
        url=req.url.strip(),
        events=req.events or ["booking.created"],
        is_active=req.is_active,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    return webhook


@router.get("/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(
    webhook_id: uuid.UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Webhook).where(Webhook.id == webhook_id)
    if current_user.role != "admin":
        stmt = stmt.where(Webhook.user_id == current_user.id)

    res = await db.execute(stmt)
    webhook = res.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    return webhook


@router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: uuid.UUID,
    req: WebhookUpdate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Webhook).where(Webhook.id == webhook_id)
    if current_user.role != "admin":
        stmt = stmt.where(Webhook.user_id == current_user.id)

    res = await db.execute(stmt)
    webhook = res.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    if req.url is not None:
        webhook.url = req.url.strip()
    if req.events is not None:
        webhook.events = req.events
    if req.is_active is not None:
        webhook.is_active = req.is_active

    await db.commit()
    await db.refresh(webhook)
    return webhook


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    webhook_id: uuid.UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Webhook).where(Webhook.id == webhook_id)
    if current_user.role != "admin":
        stmt = stmt.where(Webhook.user_id == current_user.id)

    res = await db.execute(stmt)
    webhook = res.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    await db.delete(webhook)
    await db.commit()
    return None


@router.get("/{webhook_id}/logs", response_model=List[WebhookLogResponse])
async def get_webhook_logs(
    webhook_id: uuid.UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Returns the delivery logs for a given webhook."""
    stmt = select(Webhook).where(Webhook.id == webhook_id)
    if current_user.role != "admin":
        stmt = stmt.where(Webhook.user_id == current_user.id)

    res = await db.execute(stmt)
    webhook = res.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    log_stmt = select(WebhookLog).where(
        WebhookLog.webhook_id == webhook_id
    ).order_by(WebhookLog.delivered_at.desc()).limit(50)
    log_res = await db.execute(log_stmt)
    return list(log_res.scalars().all())


@router.post("/{webhook_id}/test", response_model=WebhookTestResponse)
async def test_webhook(
    webhook_id: uuid.UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Dispatches a test payload to verify receiver connectivity."""
    stmt = select(Webhook).where(Webhook.id == webhook_id)
    if current_user.role != "admin":
        stmt = stmt.where(Webhook.user_id == current_user.id)

    res = await db.execute(stmt)
    webhook = res.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    result = await webhook_service.send_test_ping(webhook, db)
    return WebhookTestResponse(**result)
