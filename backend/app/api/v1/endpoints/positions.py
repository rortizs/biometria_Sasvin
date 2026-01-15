from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_active_admin
from app.models.position import Position
from app.models.user import User
from app.schemas.position import PositionCreate, PositionUpdate, PositionResponse

router = APIRouter()


@router.get("/", response_model=list[PositionResponse])
async def list_positions(
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = True,
) -> list[Position]:
    """List all positions."""
    query = select(Position)

    if active_only:
        query = query.where(Position.is_active == True)

    query = query.offset(skip).limit(limit).order_by(Position.name)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{position_id}", response_model=PositionResponse)
async def get_position(
    db: Annotated[AsyncSession, Depends(get_db)],
    position_id: UUID,
) -> Position:
    """Get a specific position."""
    result = await db.execute(select(Position).where(Position.id == position_id))
    position = result.scalar_one_or_none()

    if not position:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Position not found",
        )

    return position


@router.post("/", response_model=PositionResponse, status_code=status.HTTP_201_CREATED)
async def create_position(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    position_in: PositionCreate,
) -> Position:
    """Create a new position (admin only)."""
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


@router.patch("/{position_id}", response_model=PositionResponse)
async def update_position(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    position_id: UUID,
    position_in: PositionUpdate,
) -> Position:
    """Update a position (admin only)."""
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


@router.delete("/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_position(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    position_id: UUID,
) -> None:
    """Delete a position (admin only)."""
    result = await db.execute(select(Position).where(Position.id == position_id))
    position = result.scalar_one_or_none()

    if not position:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Position not found",
        )

    await db.delete(position)
    await db.commit()
