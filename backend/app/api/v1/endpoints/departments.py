from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_active_admin
from app.models.department import Department
from app.models.user import User
from app.schemas.department import DepartmentCreate, DepartmentUpdate, DepartmentResponse

router = APIRouter()


@router.get("/", response_model=list[DepartmentResponse])
async def list_departments(
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = True,
) -> list[Department]:
    """List all departments."""
    query = select(Department)

    if active_only:
        query = query.where(Department.is_active == True)

    query = query.offset(skip).limit(limit).order_by(Department.name)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{department_id}", response_model=DepartmentResponse)
async def get_department(
    db: Annotated[AsyncSession, Depends(get_db)],
    department_id: UUID,
) -> Department:
    """Get a specific department."""
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()

    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )

    return department


@router.post("/", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    department_in: DepartmentCreate,
) -> Department:
    """Create a new department (admin only)."""
    department = Department(**department_in.model_dump())
    db.add(department)
    await db.commit()
    await db.refresh(department)
    return department


@router.patch("/{department_id}", response_model=DepartmentResponse)
async def update_department(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    department_id: UUID,
    department_in: DepartmentUpdate,
) -> Department:
    """Update a department (admin only)."""
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()

    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )

    update_data = department_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(department, field, value)

    await db.commit()
    await db.refresh(department)
    return department


@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_department(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    department_id: UUID,
) -> None:
    """Delete a department (admin only)."""
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()

    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )

    await db.delete(department)
    await db.commit()
