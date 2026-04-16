from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_active_admin
from app.models.location import Location
from app.models.user import User
from app.schemas.location import LocationCreate, LocationUpdate, LocationResponse

router = APIRouter()


@router.get(
    "/",
    response_model=list[LocationResponse],
    tags=["locations"],
)
async def list_locations(
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = True,
) -> list[Location]:
    """Listar sedes de trabajo con sus coordenadas GPS y radio de validación."""
    query = select(Location)

    if active_only:
        query = query.where(Location.is_active == True)

    query = query.offset(skip).limit(limit).order_by(Location.name)

    result = await db.execute(query)
    return result.scalars().all()


@router.get(
    "/{location_id}",
    response_model=LocationResponse,
    tags=["locations"],
    responses={
        404: {"description": "Sede no encontrada"},
    },
)
async def get_location(
    db: Annotated[AsyncSession, Depends(get_db)],
    location_id: UUID,
) -> Location:
    """Obtener una sede por su UUID. Incluye coordenadas y radio de validación GPS."""
    result = await db.execute(select(Location).where(Location.id == location_id))
    location = result.scalar_one_or_none()

    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found",
        )

    return location


@router.post(
    "/",
    response_model=LocationResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["locations"],
)
async def create_location(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    location_in: LocationCreate,
) -> Location:
    """
    Crear una nueva sede de trabajo. Requiere rol admin.

    El `radius_meters` define el radio en metros alrededor de las coordenadas GPS
    dentro del cual se considera válida la geolocalización de un empleado al hacer
    check-in. Valor por defecto: 50 m. Rango válido: 10–5000 m.
    """
    location = Location(**location_in.model_dump())
    db.add(location)
    await db.commit()
    await db.refresh(location)
    return location


@router.patch(
    "/{location_id}",
    response_model=LocationResponse,
    tags=["locations"],
    responses={
        404: {"description": "Sede no encontrada"},
    },
)
async def update_location(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    location_id: UUID,
    location_in: LocationUpdate,
) -> Location:
    """Actualizar una sede parcialmente. Requiere rol admin."""
    result = await db.execute(select(Location).where(Location.id == location_id))
    location = result.scalar_one_or_none()

    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found",
        )

    update_data = location_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(location, field, value)

    await db.commit()
    await db.refresh(location)
    return location


@router.delete(
    "/{location_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["locations"],
    responses={
        404: {"description": "Sede no encontrada"},
    },
)
async def delete_location(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    location_id: UUID,
) -> None:
    """Eliminar una sede. Requiere rol admin."""
    result = await db.execute(select(Location).where(Location.id == location_id))
    location = result.scalar_one_or_none()

    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found",
        )

    await db.delete(location)
    await db.commit()
