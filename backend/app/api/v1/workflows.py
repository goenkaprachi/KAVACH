import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.event_type import EventType
from app.models.booking import Booking
from app.models.notification import Workflow, NotificationsLog
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    NotificationsLogResponse,
    RunWorkflowsResult,
)
from app.schemas.notification import SendTestEmailRequest
from app.api.deps import get_current_user, require_employee
from app.services.reminder_service import reminder_service

router = APIRouter(prefix="/workflows", tags=["Workflows & Automated Reminders"])


@router.get("", response_model=List[WorkflowResponse])
async def list_workflows(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """List all automated workflows owned by the employee (or system-wide)."""
    stmt = (
        select(Workflow)
        .where(
            (Workflow.owner_user_id == current_user.id)
            | (Workflow.owner_user_id == None)
        )
        .order_by(Workflow.trigger_type.asc(), Workflow.offset_minutes.desc())
    )
    res = await db.execute(stmt)
    workflows = res.scalars().all()

    # Enrich with event_type title if scoped
    out = []
    for wf in workflows:
        item = WorkflowResponse.model_validate(wf)
        if wf.event_type_id:
            et_stmt = select(EventType.title).where(EventType.id == wf.event_type_id)
            et_res = await db.execute(et_stmt)
            item.event_type_title = et_res.scalar_one_or_none()
        out.append(item)

    return out


@router.post("", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    req: WorkflowCreate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Create a new automated reminder workflow."""
    if req.event_type_id:
        et_stmt = select(EventType).where(EventType.id == req.event_type_id)
        et_res = await db.execute(et_stmt)
        if not et_res.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event type not found")

    wf = Workflow(
        owner_user_id=current_user.id,
        name=req.name,
        trigger_type=req.trigger_type,
        offset_minutes=req.offset_minutes,
        action_type=req.action_type,
        event_type_id=req.event_type_id,
        template_id=req.template_id,
        is_active=req.is_active,
    )
    db.add(wf)
    await db.commit()
    await db.refresh(wf)

    resp = WorkflowResponse.model_validate(wf)
    if wf.event_type_id:
        et_res = await db.execute(select(EventType.title).where(EventType.id == wf.event_type_id))
        resp.event_type_title = et_res.scalar_one_or_none()
    return resp


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: uuid.UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Workflow).where(Workflow.id == workflow_id)
    res = await db.execute(stmt)
    wf = res.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return wf


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: uuid.UUID,
    req: WorkflowUpdate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Workflow).where(Workflow.id == workflow_id)
    res = await db.execute(stmt)
    wf = res.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    update_data = req.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(wf, k, v)

    await db.commit()
    await db.refresh(wf)

    resp = WorkflowResponse.model_validate(wf)
    if wf.event_type_id:
        et_res = await db.execute(select(EventType.title).where(EventType.id == wf.event_type_id))
        resp.event_type_title = et_res.scalar_one_or_none()
    return resp


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: uuid.UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Workflow).where(Workflow.id == workflow_id)
    res = await db.execute(stmt)
    wf = res.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    await db.delete(wf)
    await db.commit()
    return None


@router.post("/{workflow_id}/test")
async def test_workflow(
    workflow_id: uuid.UUID,
    req: SendTestEmailRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Dispatches an immediate sample test email of the workflow to the requested address."""
    stmt = select(Workflow).where(Workflow.id == workflow_id)
    res = await db.execute(stmt)
    wf = res.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    await reminder_service.send_test_workflow(
        workflow=wf,
        recipient_email=req.recipient_email,
        current_user=current_user,
        db=db,
    )
    return {"message": f"Test reminder email dispatched to {req.recipient_email}"}


@router.get("/logs/history", response_model=List[NotificationsLogResponse])
async def get_notification_logs(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Returns recent notification activity and delivery status."""
    stmt = (
        select(NotificationsLog)
        .order_by(desc(NotificationsLog.created_at))
        .limit(limit)
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()

    out = []
    for log in logs:
        # Load booking and workflow metadata
        b_stmt = select(Booking.title).where(Booking.id == log.booking_id)
        b_res = await db.execute(b_stmt)
        b_title = b_res.scalar_one_or_none()

        wf_title = None
        if log.workflow_id:
            wf_stmt = select(Workflow.name).where(Workflow.id == log.workflow_id)
            wf_res = await db.execute(wf_stmt)
            wf_title = wf_res.scalar_one_or_none()

        out.append(
            NotificationsLogResponse(
                id=log.id,
                booking_id=log.booking_id,
                workflow_id=log.workflow_id,
                workflow_name=wf_title,
                booking_title=b_title or "Meeting",
                recipient_email=None,
                channel=log.channel,
                status=log.status,
                sent_at=log.sent_at,
                created_at=log.created_at,
            )
        )
    return out


@router.post("/run-now", response_model=RunWorkflowsResult)
async def trigger_run_now(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Manually triggers evaluation of all due reminders immediately."""
    result = await reminder_service.process_due_reminders(db)
    return result
