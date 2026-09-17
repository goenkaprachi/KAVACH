import uuid
import urllib.parse
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.routing_form import RoutingForm
from app.models.event_type import EventType
from app.schemas.routing_form import (
    RoutingFormCreate,
    RoutingFormUpdate,
    RoutingFormResponse,
    RoutingFormPublicResponse,
    RoutingFormEvaluateRequest,
    RoutingFormEvaluateResponse,
)
from app.api.v1.auth import require_employee

router = APIRouter(prefix="/routing-forms", tags=["Routing Forms"])


@router.get("", response_model=List[RoutingFormResponse])
async def list_routing_forms(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == "admin":
        stmt = select(RoutingForm).order_by(RoutingForm.created_at.desc())
    else:
        stmt = select(RoutingForm).where(RoutingForm.owner_user_id == current_user.id).order_by(RoutingForm.created_at.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=RoutingFormResponse, status_code=status.HTTP_201_CREATED)
async def create_routing_form(
    req: RoutingFormCreate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    slug_clean = req.slug.lower().strip()
    check_stmt = select(RoutingForm).where(RoutingForm.slug == slug_clean)
    check_res = await db.execute(check_stmt)
    if check_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A routing form with slug '{slug_clean}' already exists.",
        )

    new_form = RoutingForm(
        id=uuid.uuid4(),
        owner_user_id=current_user.id,
        name=req.name,
        slug=slug_clean,
        description=req.description,
        is_active=req.is_active,
        fields=req.fields,
        rules=req.rules,
        fallback_action=req.fallback_action,
        fallback_target=req.fallback_target,
    )
    db.add(new_form)
    await db.commit()
    await db.refresh(new_form)
    return new_form


@router.get("/{id}", response_model=RoutingFormResponse)
async def get_routing_form(
    id: uuid.UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(RoutingForm).where(RoutingForm.id == id)
    res = await db.execute(stmt)
    form = res.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routing form not found")
    if current_user.role != "admin" and form.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return form


@router.patch("/{id}", response_model=RoutingFormResponse)
async def update_routing_form(
    id: uuid.UUID,
    req: RoutingFormUpdate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(RoutingForm).where(RoutingForm.id == id)
    res = await db.execute(stmt)
    form = res.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routing form not found")
    if current_user.role != "admin" and form.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    update_data = req.model_dump(exclude_unset=True)
    if "slug" in update_data:
        new_slug = update_data["slug"].lower().strip()
        if new_slug != form.slug:
            check_stmt = select(RoutingForm).where(RoutingForm.slug == new_slug)
            check_res = await db.execute(check_stmt)
            if check_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"A routing form with slug '{new_slug}' already exists.",
                )
            form.slug = new_slug

    for k, v in update_data.items():
        if k != "slug":
            setattr(form, k, v)

    await db.commit()
    await db.refresh(form)
    return form


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_routing_form(
    id: uuid.UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(RoutingForm).where(RoutingForm.id == id)
    res = await db.execute(stmt)
    form = res.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routing form not found")
    if current_user.role != "admin" and form.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await db.delete(form)
    await db.commit()
    return None


# --- Public Routing Endpoints ---

@router.get("/public/{slug}", response_model=RoutingFormPublicResponse)
async def get_public_routing_form(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(RoutingForm).where(
        RoutingForm.slug == slug.lower().strip(),
        RoutingForm.is_active == True,
    ).options(selectinload(RoutingForm.owner))
    res = await db.execute(stmt)
    form = res.scalar_one_or_none()
    if not form or not form.owner or form.owner.status != "active":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routing form not found or inactive")

    return RoutingFormPublicResponse(
        id=form.id,
        name=form.name,
        slug=form.slug,
        description=form.description,
        fields=form.fields or [],
        owner_name=form.owner.name,
        owner_username=form.owner.username,
    )


@router.post("/public/{slug}/evaluate", response_model=RoutingFormEvaluateResponse)
async def evaluate_routing_form(
    slug: str,
    req: RoutingFormEvaluateRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(RoutingForm).where(
        RoutingForm.slug == slug.lower().strip(),
        RoutingForm.is_active == True,
    ).options(selectinload(RoutingForm.owner))
    res = await db.execute(stmt)
    form = res.scalar_one_or_none()
    if not form or not form.owner or form.owner.status != "active":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routing form not found or inactive")

    user_answers = req.answers or {}
    params: dict = {}
    if req.invitee_name:
        params["name"] = req.invitee_name
    if req.invitee_email:
        params["email"] = req.invitee_email

    for k, v in user_answers.items():
        if v is not None and str(v).strip():
            params[k] = str(v).strip()

    qs = ("?" + urllib.parse.urlencode(params)) if params else ""

    # Evaluate rules in sequence
    rules = form.rules or []
    for rule in rules:
        conditions = rule.get("conditions", [])
        if not conditions:
            continue

        all_matched = True
        for cond in conditions:
            f_id = cond.get("field_id")
            op = cond.get("operator", "equals")
            expected = str(cond.get("value", "")).strip().lower()

            # Find answer by field_id or label
            actual_val = user_answers.get(f_id)
            if actual_val is None:
                for f in form.fields or []:
                    if f.get("id") == f_id:
                        actual_val = user_answers.get(f.get("label"))
                        break

            actual_str = str(actual_val or "").strip().lower()

            if op == "equals":
                if actual_str != expected:
                    all_matched = False
                    break
            elif op == "not_equals":
                if actual_str == expected:
                    all_matched = False
                    break
            elif op == "contains":
                if expected not in actual_str:
                    all_matched = False
                    break

        if all_matched:
            action = rule.get("action", "event_type")
            if action == "event_type":
                host_uname = rule.get("target_owner_username") or form.owner.username
                et_slug = rule.get("target_slug") or ""
                target_url = f"/{host_uname}/{et_slug}{qs}"
                return RoutingFormEvaluateResponse(
                    action="redirect_event_type",
                    target_url=target_url,
                    matched_rule_id=rule.get("id"),
                    message=f"Matched routing rule: {rule.get('name') or 'Rule'}",
                )
            elif action == "custom_url":
                custom_url = rule.get("target_url") or "/"
                return RoutingFormEvaluateResponse(
                    action="redirect_url",
                    target_url=custom_url,
                    matched_rule_id=rule.get("id"),
                    message=f"Matched routing rule: {rule.get('name') or 'Rule'}",
                )

    # Fallback if no rules matched
    fallback_action = form.fallback_action or "event_type"
    fallback_target = form.fallback_target or ""
    if fallback_action == "event_type":
        target_url = f"/{form.owner.username}/{fallback_target}{qs}"
        return RoutingFormEvaluateResponse(
            action="redirect_event_type",
            target_url=target_url,
            matched_rule_id=None,
            message="No specific rule matched. Routed to default fallback event.",
        )
    else:
        return RoutingFormEvaluateResponse(
            action="redirect_url",
            target_url=fallback_target or "/",
            matched_rule_id=None,
            message="No specific rule matched. Routed to fallback URL.",
        )
