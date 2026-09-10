"""Scope admin surface (design.md D4, task 3.8). `user_scopes.manage`-gated
CRUD binding COORDINADOR/DIRECTOR to a facultad/sede and SECRETARIA to one
or more DIRECTOR users. Spec: rbac-access-model "Organizational Scope
Assignment" -- "Coordinador/Secretaría scope assignment is persisted",
"Only authorized actor manages scope assignments"."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission
from app.models.user import User
from app.models.user_scope_assignment import UserScopeAssignment
from app.schemas.user_scope_assignment import (
    UserScopeAssignmentCreate,
    UserScopeAssignmentResponse,
)

router = APIRouter()


async def _get_assignment_or_404(db: AsyncSession, assignment_id: UUID) -> UserScopeAssignment:
    result = await db.execute(
        select(UserScopeAssignment).where(UserScopeAssignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scope assignment not found")
    return assignment


@router.get("/", response_model=list[UserScopeAssignmentResponse])
async def list_user_scope_assignments(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("user_scopes.manage"))],
    user_id: UUID | None = None,
) -> list[UserScopeAssignment]:
    query = select(UserScopeAssignment)
    if user_id is not None:
        query = query.where(UserScopeAssignment.user_id == user_id)
    result = await db.execute(query.order_by(UserScopeAssignment.created_at))
    return result.scalars().all()


@router.post("/", response_model=UserScopeAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_user_scope_assignment(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("user_scopes.manage"))],
    payload: UserScopeAssignmentCreate,
) -> UserScopeAssignment:
    assignment = UserScopeAssignment(
        user_id=payload.user_id,
        department_id=payload.department_id,
        location_id=payload.location_id,
        director_user_id=payload.director_user_id,
    )
    db.add(assignment)
    try:
        await db.commit()
    except IntegrityError:
        # design.md D4 partial unique indexes (task 3.4b): a duplicate
        # (user_id, target) row raises IntegrityError at commit time.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A scope assignment already exists for this user and target",
        ) from None
    await db.refresh(assignment)
    return assignment


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_scope_assignment(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("user_scopes.manage"))],
    assignment_id: UUID,
) -> None:
    assignment = await _get_assignment_or_404(db, assignment_id)
    await db.delete(assignment)
    await db.commit()
