from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_active_admin, get_current_user
from app.models.role import Role
from app.models.permission import Permission
from app.models.role_permission import UserRoleAssignment
from app.models.user import User, UserRole
from app.schemas.role import (
    RoleCreate,
    RoleUpdate,
    RoleResponse,
    UserRoleAssign,
    UserRoleAssignmentResponse,
)

router = APIRouter()

# Roles that can only have one role assigned at a time
SINGLE_ROLE_NAMES = {"secretaria", "catedratico"}


async def _get_role_or_404(db: AsyncSession, role_id: UUID) -> Role:
    result = await db.execute(
        select(Role).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return role


# ---------------------------------------------------------------------------
# Role CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[RoleResponse])
async def list_roles(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_active_admin)],
    active_only: bool = True,
) -> list[Role]:
    query = select(Role)
    if active_only:
        query = query.where(Role.is_active == True)
    result = await db.execute(query.order_by(Role.name))
    return result.scalars().all()


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_active_admin)],
    role_id: UUID,
) -> Role:
    return await _get_role_or_404(db, role_id)


@router.post("/", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_active_admin)],
    role_in: RoleCreate,
) -> Role:
    existing = await db.execute(select(Role).where(Role.name == role_in.name))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Role '{role_in.name}' already exists",
        )

    role = Role(name=role_in.name, description=role_in.description, is_active=role_in.is_active)

    if role_in.permission_ids:
        perms = await db.execute(
            select(Permission).where(Permission.id.in_(role_in.permission_ids))
        )
        role.permissions = list(perms.scalars().all())

    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role


@router.patch("/{role_id}", response_model=RoleResponse)
async def update_role(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_active_admin)],
    role_id: UUID,
    role_in: RoleUpdate,
) -> Role:
    role = await _get_role_or_404(db, role_id)

    update_data = role_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(role, field, value)

    await db.commit()
    await db.refresh(role)
    return role


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_active_admin)],
    role_id: UUID,
) -> None:
    role = await _get_role_or_404(db, role_id)
    await db.delete(role)
    await db.commit()


@router.put("/{role_id}/permissions", response_model=RoleResponse)
async def set_role_permissions(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_active_admin)],
    role_id: UUID,
    permission_ids: list[UUID],
) -> Role:
    role = await _get_role_or_404(db, role_id)

    perms = await db.execute(
        select(Permission).where(Permission.id.in_(permission_ids))
    )
    role.permissions = list(perms.scalars().all())

    await db.commit()
    await db.refresh(role)
    return role


# ---------------------------------------------------------------------------
# User ↔ Role assignment
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}/roles", response_model=list[UserRoleAssignmentResponse])
async def get_user_roles(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_active_admin)],
    user_id: UUID,
) -> list[UserRoleAssignment]:
    result = await db.execute(
        select(UserRoleAssignment)
        .where(UserRoleAssignment.user_id == user_id)
        .options(selectinload(UserRoleAssignment.role))
    )
    return result.scalars().all()


@router.put("/users/{user_id}/roles", response_model=list[UserRoleAssignmentResponse])
async def assign_user_roles(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    user_id: UUID,
    payload: UserRoleAssign,
) -> list[UserRoleAssignment]:
    # Verify target user exists
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Validate requested roles exist
    roles_result = await db.execute(
        select(Role).where(Role.id.in_(payload.role_ids))
    )
    roles = roles_result.scalars().all()
    if len(roles) != len(payload.role_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more role IDs are invalid",
        )

    # Business rule: single-role constraint for secretaria/catedratico
    if len(payload.role_ids) > 1:
        restricted = [r for r in roles if r.name in SINGLE_ROLE_NAMES]
        if restricted:
            names = ", ".join(r.name for r in restricted)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Roles [{names}] only allow one role assignment at a time",
            )

    # Replace existing assignments
    existing = await db.execute(
        select(UserRoleAssignment).where(UserRoleAssignment.user_id == user_id)
    )
    for assignment in existing.scalars().all():
        await db.delete(assignment)

    new_assignments = [
        UserRoleAssignment(
            user_id=user_id,
            role_id=role_id,
            assigned_by=current_user.id,
        )
        for role_id in payload.role_ids
    ]
    db.add_all(new_assignments)
    await db.commit()

    # Reload with relationships
    result = await db.execute(
        select(UserRoleAssignment)
        .where(UserRoleAssignment.user_id == user_id)
        .options(selectinload(UserRoleAssignment.role))
    )
    return result.scalars().all()
