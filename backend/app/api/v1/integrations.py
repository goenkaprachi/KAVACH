from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.models.integration import MeetingProviderConfig
from app.api.deps import require_employee

router = APIRouter(prefix="/integrations", tags=["Integrations"])

PROVIDER_DISPLAY_NAMES = {
    "jitsi": "Video Call (Web Browser)",
    "google_meet": "Google Meet",
    "zoom": "Zoom Video",
    "microsoft_teams": "Microsoft Teams",
    "whereby": "Whereby",
}


@router.get("/available", response_model=List[Dict[str, Any]])
async def get_available_integrations(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Returns only the meeting video providers that are currently enabled for the organization."""
    stmt = select(MeetingProviderConfig).where(MeetingProviderConfig.is_enabled == True)
    res = await db.execute(stmt)
    enabled_configs = {c.provider: c for c in res.scalars().all() if c.credentials_encrypted}

    output = [
        {
            "provider": "jitsi",
            "display_name": PROVIDER_DISPLAY_NAMES["jitsi"],
            "is_default": True,
        }
    ]

    for prov, label in PROVIDER_DISPLAY_NAMES.items():
        if prov != "jitsi" and prov in enabled_configs:
            output.append({
                "provider": prov,
                "display_name": label,
                "is_default": False,
            })

    # If employee has connected their local Google account, enable Google Meet
    has_google = any(p["provider"] == "google_meet" for p in output)
    if not has_google and getattr(current_user, "google_email", None):
        output.append({
            "provider": "google_meet",
            "display_name": f"Google Meet ({current_user.google_email})",
            "is_default": False,
            "connected_account": current_user.google_email,
        })

    return output
