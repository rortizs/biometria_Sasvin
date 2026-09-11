from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_technical_rbac_admin, settings
from app.models.permission import Permission
from app.models.user import User
from app.schemas.role import PermissionResponse

router = APIRouter()


@router.get("/", response_model=list[PermissionResponse])
async def list_permissions(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_technical_rbac_admin)],
    module: str | None = Query(None, description="Filter by module"),
    configured_settings=settings,
) -> list[Permission]:
    await get_current_technical_rbac_admin(current_user, configured_settings)
    query = select(Permission).order_by(Permission.module, Permission.action)
    if module:
        query = query.where(Permission.module == module)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{permission_id}", response_model=PermissionResponse)
async def get_permission(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_technical_rbac_admin)],
    permission_id: UUID,
    configured_settings=settings,
) -> Permission:
    await get_current_technical_rbac_admin(current_user, configured_settings)
    result = await db.execute(
        select(Permission).where(Permission.id == permission_id)
    )
    permission = result.scalar_one_or_none()
    if not permission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")
    return permission
