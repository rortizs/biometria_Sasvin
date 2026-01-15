from typing import Annotated
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_active_admin
from app.models.settings import Settings
from app.models.user import User
from app.schemas.settings import SettingsCreate, SettingsUpdate, SettingsResponse

router = APIRouter()


@router.get("/", response_model=SettingsResponse)
async def get_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Settings:
    """Get system settings (singleton)."""
    result = await db.execute(select(Settings).limit(1))
    settings = result.scalar_one_or_none()

    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Settings not configured. Please run seed data.",
        )

    return settings


@router.put("/", response_model=SettingsResponse)
async def update_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    settings_in: SettingsUpdate,
) -> Settings:
    """Update system settings (admin only)."""
    result = await db.execute(select(Settings).limit(1))
    settings = result.scalar_one_or_none()

    if not settings:
        # Create if doesn't exist
        settings = Settings(
            company_name=settings_in.company_name or "My Company",
            email_domain=settings_in.email_domain or "company.com",
            company_address=settings_in.company_address,
            slogan=settings_in.slogan,
            logo_url=settings_in.logo_url,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(settings)
    else:
        update_data = settings_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(settings, field, value)

    await db.commit()
    await db.refresh(settings)
    return settings


@router.post("/", response_model=SettingsResponse, status_code=status.HTTP_201_CREATED)
async def create_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    settings_in: SettingsCreate,
) -> Settings:
    """Create system settings (only if none exist)."""
    result = await db.execute(select(Settings).limit(1))
    existing = result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Settings already exist. Use PUT to update.",
        )

    settings = Settings(**settings_in.model_dump())
    db.add(settings)
    await db.commit()
    await db.refresh(settings)
    return settings
