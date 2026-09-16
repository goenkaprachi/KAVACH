from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import encrypt_data, decrypt_data
from app.models.user import User
from app.models.integration import MeetingProviderConfig
from app.schemas.integration import MeetingProviderConfigUpdate, MeetingProviderConfigResponse
from app.api.deps import require_admin

router = APIRouter(prefix="/admin/integrations", tags=["Admin Integrations"])

SUPPORTED_PROVIDERS = ["jitsi", "google_meet", "zoom", "microsoft_teams", "whereby"]

PROVIDER_NAMES = {
    "jitsi": "Jitsi Meet",
    "google_meet": "Google Meet",
    "zoom": "Zoom",
    "microsoft_teams": "Microsoft Teams",
    "whereby": "Whereby",
}


@router.get("", response_model=List[Dict[str, Any]])
async def list_integrations(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(MeetingProviderConfig)
    res = await db.execute(stmt)
    configs = {c.provider: c for c in res.scalars().all()}

    output = []
    for prov in SUPPORTED_PROVIDERS:
        cfg = configs.get(prov)
        if prov == "jitsi":
            output.append({
                "provider": "jitsi",
                "display_name": "Jitsi Meet (Zero-Config Default)",
                "is_enabled": True,
                "is_configured": True,
                "auth_type": "none",
                "notes": "Always enabled and used as fallback safety net."
            })
        else:
            is_configured = bool(cfg and cfg.credentials_encrypted) if cfg else False
            is_enabled = bool(cfg and cfg.is_enabled and cfg.credentials_encrypted) if cfg else False
            output.append({
                "provider": prov,
                "display_name": prov.replace("_", " ").title(),
                "is_enabled": is_enabled,
                "is_configured": is_configured,
                "auth_type": "oauth" if prov in ("google_meet", "zoom", "microsoft_teams") else "api_key",
                "updated_at": cfg.updated_at.isoformat() if cfg else None
            })

    return output


@router.put("/{provider}")
async def configure_integration(
    provider: str,
    payload: MeetingProviderConfigUpdate,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider. Supported: {', '.join(SUPPORTED_PROVIDERS)}"
        )

    if provider == "jitsi":
        return {"provider": "jitsi", "status": "always_enabled"}

    stmt = select(MeetingProviderConfig).where(MeetingProviderConfig.provider == provider)
    res = await db.execute(stmt)
    cfg = res.scalar_one_or_none()

    encrypted_creds = {}
    for k, v in payload.credentials.items():
        if isinstance(v, str) and v.strip():
            encrypted_creds[k] = encrypt_data(v)

    has_creds = bool(encrypted_creds) or bool(cfg and cfg.credentials_encrypted)
    if payload.is_enabled and not has_creds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{PROVIDER_NAMES.get(provider, provider)} cannot be enabled without configuration credentials."
        )

    if not cfg:
        cfg = MeetingProviderConfig(
            provider=provider,
            is_enabled=payload.is_enabled and has_creds,
            credentials_encrypted=encrypted_creds,
            configured_by=current_admin.id
        )
        db.add(cfg)
    else:
        cfg.is_enabled = payload.is_enabled and has_creds
        if encrypted_creds:
            cfg.credentials_encrypted = encrypted_creds
        cfg.configured_by = current_admin.id

    await db.commit()
    await db.refresh(cfg)

    return {
        "provider": provider,
        "is_enabled": bool(cfg.is_enabled and cfg.credentials_encrypted),
        "is_configured": bool(cfg.credentials_encrypted),
        "updated_at": cfg.updated_at.isoformat()
    }


@router.patch("/{provider}/toggle")
async def toggle_integration(
    provider: str,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider. Supported: {', '.join(SUPPORTED_PROVIDERS)}"
        )

    if provider == "jitsi":
        return {"provider": "jitsi", "is_enabled": True, "notes": "Jitsi is always enabled"}

    stmt = select(MeetingProviderConfig).where(MeetingProviderConfig.provider == provider)
    res = await db.execute(stmt)
    cfg = res.scalar_one_or_none()

    if not cfg or not cfg.credentials_encrypted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{PROVIDER_NAMES.get(provider, provider)} is not configured. Please configure credentials before enabling."
        )

    cfg.is_enabled = not cfg.is_enabled
    cfg.configured_by = current_admin.id

    await db.commit()
    await db.refresh(cfg)

    return {
        "provider": provider,
        "is_enabled": bool(cfg.is_enabled and cfg.credentials_encrypted),
        "is_configured": bool(cfg.credentials_encrypted),
        "updated_at": cfg.updated_at.isoformat()
    }
