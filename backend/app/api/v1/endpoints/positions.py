from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_active_admin, get_current_secretaria_or_above
from app.models.position import Position
from app.models.user import User
from app.schemas.position import PositionCreate, PositionUpdate, PositionResponse

router = APIRouter()


@router.get(
    "/",
    response_model=list[PositionResponse],
    tags=["positions"],
)
async def list_positions(
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = True,
) -> list[Position]:
    """Listar cargos y puestos. No requiere autenticación."""
    query = select(Position)

    if active_only:
        query = query.where(Position.is_active == True)

    query = query.offset(skip).limit(limit).order_by(Position.name)

    result = await db.execute(query)
    return result.scalars().all()


@router.get(
    "/{position_id}",
    response_model=PositionResponse,
    tags=["positions"],
    responses={
        404: {"description": "Puesto no encontrado"},
    },
)
async def get_position(
    db: Annotated[AsyncSession, Depends(get_db)],
    position_id: UUID,
) -> Position:
    """Obtener un puesto por su UUID."""
    result = await db.execute(select(Position).where(Position.id == position_id))
    position = result.scalar_one_or_none()

    if not position:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Position not found",
        )

    return position


@router.post(
    "/",
    response_model=PositionResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["positions"],
    responses={
        400: {"description": "Ya existe un puesto con ese nombre — el nombre debe ser único"},
        403: {"description": "Permisos insuficientes"},
    },
)
async def create_position(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_secretaria_or_above)],
    position_in: PositionCreate,
) -> Position:
    """Crear un nuevo cargo o puesto. Requiere rol secretaria o superior. El nombre debe ser único."""
    # Check if name already exists
    result = await db.execute(select(Position).where(Position.name == position_in.name))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Position with this name already exists",
        )

    position = Position(**position_in.model_dump())
    db.add(position)
    await db.commit()
    await db.refresh(position)
    return position


@router.patch(
    "/{position_id}",
    response_model=PositionResponse,
    tags=["positions"],
    responses={
        403: {"description": "Permisos insuficientes"},
        404: {"description": "Puesto no encontrado"},
    },
)
async def update_position(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_secretaria_or_above)],
    position_id: UUID,
    position_in: PositionUpdate,
) -> Position:
    """Actualizar un puesto parcialmente. Requiere rol secretaria o superior."""
    result = await db.execute(select(Position).where(Position.id == position_id))
    position = result.scalar_one_or_none()

    if not position:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Position not found",
        )

    update_data = position_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(position, field, value)

    await db.commit()
    await db.refresh(position)
    return position


@router.delete(
    "/{position_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["positions"],
    responses={
        401: {"description": "Token inválido o expirado — se requiere rol admin"},
        403: {"description": "Solo el admin puede eliminar puestos"},
        404: {"description": "Puesto no encontrado"},
    },
)
async def delete_position(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    position_id: UUID,
) -> None:
    """Eliminar un puesto. Requiere rol admin."""
    result = await db.execute(select(Position).where(Position.id == position_id))
    position = result.scalar_one_or_none()

    if not position:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Position not found",
        )

    await db.delete(position)
    await db.commit()
