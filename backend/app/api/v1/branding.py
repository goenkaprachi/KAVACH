"""
Phase 13 — Custom Branding & White-Labeling API
Admin-only endpoints to configure org-wide branding that appears on:
  - Public booking pages
  - Email footers / signatures
  - Dashboard header

Endpoints
---------
GET  /admin/branding           -> current branding settings (public-safe read)
PUT  /admin/branding           -> update branding settings (admin only)
GET  /branding/public          -> public endpoint: read branding for booking pages (no auth)
"""

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.user import User
from app.models.system_setting import SystemSetting

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Branding"])

# The full set of supported branding keys with defaults and descriptions
BRANDING_KEYS: Dict[str, Dict[str, Any]] = {
    "company_name": {
        "default": "Kavach Connect",
        "description": "Organisation name shown on booking pages and emails",
    },
    "logo_url": {
        "default": "",
        "description": "Full URL of the organisation logo (PNG/SVG recommended)",
    },
    "favicon_url": {
        "default": "",
        "description": "Full URL of the browser favicon (.ico or PNG)",
    },
    "primary_color": {
        "default": "#0284c7",
        "description": "Primary brand colour (hex code) for buttons and accents",
    },
    "booking_page_headline": {
        "default": "Schedule a Meeting",
        "description": "Hero headline shown on public booking pages",
    },
    "booking_page_subtext": {
        "default": "Choose a time that works for you.",
        "description": "Sub-headline shown below the hero headline",
    },
    "support_email": {
        "default": "",
        "description": "Support / contact email shown in email footers",
    },
    "footer_text": {
        "default": "Powered by Kavach Connect",
        "description": "Custom text in the booking page footer",
    },
    "hide_powered_by": {
        "default": "false",
        "description": "Set to 'true' to hide the Kavach Connect branding badge",
    },
    "custom_css": {
        "default": "",
        "description": "Optional raw CSS snippet injected into public booking pages",
    },
}


class BrandingUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: Optional[str] = None
    booking_page_headline: Optional[str] = None
    booking_page_subtext: Optional[str] = None
    support_email: Optional[str] = None
    footer_text: Optional[str] = None
    hide_powered_by: Optional[bool] = None
    custom_css: Optional[str] = None


async def _load_branding(db: AsyncSession) -> Dict[str, str]:
    stmt = select(SystemSetting)
    res = await db.execute(stmt)
    rows = {r.key: r.value for r in res.scalars().all()}

    # Merge with defaults
    result = {}
    for key, meta in BRANDING_KEYS.items():
        result[key] = rows.get(key, meta["default"]) or meta["default"]
    return result


async def _upsert_key(db: AsyncSession, key: str, value: str):
    stmt = select(SystemSetting).where(SystemSetting.key == key)
    res = await db.execute(stmt)
    row = res.scalar_one_or_none()
    if row:
        row.value = value
    else:
        row = SystemSetting(
            key=key,
            value=value,
            description=BRANDING_KEYS.get(key, {}).get("description", ""),
        )
        db.add(row)


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/branding")
async def get_branding(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Returns all branding settings with their current values and descriptions."""
    branding = await _load_branding(db)
    return {
        key: {
            "value": branding[key],
            "description": BRANDING_KEYS[key]["description"],
            "default": BRANDING_KEYS[key]["default"],
        }
        for key in BRANDING_KEYS
    }


@router.put("/admin/branding")
async def update_branding(
    req: BrandingUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Updates one or more branding settings (admin only)."""
    updates: Dict[str, str] = {}

    if req.company_name is not None:
        updates["company_name"] = req.company_name
    if req.logo_url is not None:
        updates["logo_url"] = req.logo_url
    if req.favicon_url is not None:
        updates["favicon_url"] = req.favicon_url
    if req.primary_color is not None:
        updates["primary_color"] = req.primary_color
    if req.booking_page_headline is not None:
        updates["booking_page_headline"] = req.booking_page_headline
    if req.booking_page_subtext is not None:
        updates["booking_page_subtext"] = req.booking_page_subtext
    if req.support_email is not None:
        updates["support_email"] = req.support_email
    if req.footer_text is not None:
        updates["footer_text"] = req.footer_text
    if req.hide_powered_by is not None:
        updates["hide_powered_by"] = "true" if req.hide_powered_by else "false"
    if req.custom_css is not None:
        updates["custom_css"] = req.custom_css

    for key, value in updates.items():
        await _upsert_key(db, key, value)

    await db.commit()
    return {"status": "ok", "updated_keys": list(updates.keys())}


# ---------------------------------------------------------------------------
# Public endpoint (no auth)
# ---------------------------------------------------------------------------

@router.get("/branding/public")
async def get_public_branding(db: AsyncSession = Depends(get_db)):
    """
    Returns branding settings safe for public booking pages.
    Excludes sensitive keys like custom_css by default.
    """
    branding = await _load_branding(db)
    # Only expose safe keys to public
    public_keys = [
        "company_name", "logo_url", "favicon_url",
        "primary_color", "booking_page_headline",
        "booking_page_subtext", "footer_text", "hide_powered_by",
    ]
    return {k: branding[k] for k in public_keys}
