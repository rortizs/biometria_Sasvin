from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_active_admin, get_current_secretaria_or_above
from app.models.department import Department
from app.models.user import User
from app.schemas.department import DepartmentCreate, DepartmentUpdate, DepartmentResponse

router = APIRouter()


@router.get(
    "/",
    response_model=list[DepartmentResponse],
    tags=["departments"],
)
async def list_departments(
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = True,
) -> list[Department]:
    """Listar facultades y departamentos. No requiere autenticación."""
    query = select(Department)

    if active_only:
        query = query.where(Department.is_active == True)

    query = query.offset(skip).limit(limit).order_by(Department.name)

    result = await db.execute(query)
    return result.scalars().all()


@router.get(
    "/{department_id}",
    response_model=DepartmentResponse,
    tags=["departments"],
    responses={
        404: {"description": "Departamento no encontrado"},
    },
)
async def get_department(
    db: Annotated[AsyncSession, Depends(get_db)],
    department_id: UUID,
) -> Department:
    """Obtener un departamento por su UUID."""
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()

    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )

    return department


@router.post(
    "/",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["departments"],
    responses={
        403: {"description": "Permisos insuficientes"},
    },
)
async def create_department(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_secretaria_or_above)],
    department_in: DepartmentCreate,
) -> Department:
    """Crear un nuevo departamento o facultad. Requiere rol secretaria o superior."""
    department = Department(**department_in.model_dump())
    db.add(department)
    await db.commit()
    await db.refresh(department)
    return department


@router.patch(
    "/{department_id}",
    response_model=DepartmentResponse,
    tags=["departments"],
    responses={
        403: {"description": "Permisos insuficientes"},
        404: {"description": "Departamento no encontrado"},
    },
)
async def update_department(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_secretaria_or_above)],
    department_id: UUID,
    department_in: DepartmentUpdate,
) -> Department:
    """Actualizar un departamento parcialmente. Requiere rol secretaria o superior."""
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


@router.delete(
    "/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["departments"],
    responses={
        401: {"description": "Token inválido o expirado — se requiere rol admin"},
        403: {"description": "Solo el admin puede eliminar departamentos"},
        404: {"description": "Departamento no encontrado"},
    },
)
async def delete_department(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    department_id: UUID,
) -> None:
    """Eliminar un departamento. Requiere rol admin."""
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()

    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )

    await db.delete(department)
    await db.commit()
