import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.models.notification import NotificationTemplate
from app.schemas.notification import (
    NotificationTemplateResponse,
    NotificationTemplateUpdateRequest,
    SendTestEmailRequest,
)
from app.api.deps import require_admin
from app.services.email_service import email_service, SYSTEM_DEFAULT_TEMPLATES

router = APIRouter(prefix="/admin/notification-templates", tags=["Admin Notification Templates"])


@router.get("", response_model=List[NotificationTemplateResponse])
async def list_templates(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(NotificationTemplate)
    res = await db.execute(stmt)
    existing = {t.type: t for t in res.scalars().all()}

    new_templates = []
    for tmpl_type, tmpl_data in SYSTEM_DEFAULT_TEMPLATES.items():
        if tmpl_type not in existing:
            new_templates.append(
                NotificationTemplate(
                    name=tmpl_data["name"],
                    type=tmpl_type,
                    subject=tmpl_data["subject"],
                    body=tmpl_data["body"],
                )
            )
    if new_templates:
        db.add_all(new_templates)
        await db.commit()

    stmt = select(NotificationTemplate).order_by(NotificationTemplate.name.asc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/{template_id}", response_model=NotificationTemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(NotificationTemplate).where(NotificationTemplate.id == template_id)
    res = await db.execute(stmt)
    tmpl = res.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return tmpl


@router.patch("/{template_id}", response_model=NotificationTemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    req: NotificationTemplateUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(NotificationTemplate).where(NotificationTemplate.id == template_id)
    res = await db.execute(stmt)
    tmpl = res.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    if req.name is not None:
        tmpl.name = req.name
    if req.subject is not None:
        tmpl.subject = req.subject
    if req.body is not None:
        tmpl.body = req.body

    await db.commit()
    await db.refresh(tmpl)
    return tmpl


@router.post("/{template_id}/reset", response_model=NotificationTemplateResponse)
async def reset_template(
    template_id: uuid.UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(NotificationTemplate).where(NotificationTemplate.id == template_id)
    res = await db.execute(stmt)
    tmpl = res.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    default = SYSTEM_DEFAULT_TEMPLATES.get(tmpl.type)
    if not default:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No system default available for this template type")

    tmpl.subject = default["subject"]
    tmpl.body = default["body"]
    await db.commit()
    await db.refresh(tmpl)
    return tmpl


@router.post("/{template_id}/test")
async def send_test_template_email(
    template_id: uuid.UUID,
    req: SendTestEmailRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(NotificationTemplate).where(NotificationTemplate.id == template_id)
    res = await db.execute(stmt)
    tmpl = res.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    sample_context = {
        "attendee_name": "Alex Johnson",
        "attendee_email": req.recipient_email,
        "host_name": current_admin.name,
        "host_email": current_admin.email,
        "event_title": "Product Demonstration Sync",
        "start_time": "Thursday, October 15, 2026 at 02:30 PM UTC",
        "end_time": "Thursday, October 15, 2026 at 03:00 PM UTC",
        "old_start_time": "Wednesday, October 14, 2026 at 11:00 AM UTC",
        "new_start_time": "Thursday, October 15, 2026 at 02:30 PM UTC",
        "meeting_url": "https://meet.google.com/abc-defg-hij",
        "reason": "Schedule conflict with urgent client deployment",
        "cancellation_token": "demo-token-12345",
        "agenda_block": "<p><strong>Agenda:</strong> Review Q4 roadmap and client requirements.</p>",
    }

    interpolated_subject = tmpl.subject
    interpolated_body = tmpl.body
    for k, v in sample_context.items():
        interpolated_subject = interpolated_subject.replace(f"{{{k}}}", str(v))
        interpolated_body = interpolated_body.replace(f"{{{k}}}", str(v))

    await email_service.send_email(
        recipient_email=req.recipient_email,
        subject=f"[TEST] {interpolated_subject}",
        html_body=interpolated_body,
    )
    return {"message": f"Test email dispatched to {req.recipient_email}"}
