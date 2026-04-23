from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_active_admin
from app.core.security import get_password_hash
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate, UserPasswordChange

router = APIRouter()


async def _get_user_or_404(db: AsyncSession, user_id: UUID) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return user


@router.get(
    "/",
    response_model=list[UserResponse],
    tags=["users"],
    responses={
        401: {"description": "Token inválido o expirado"},
        403: {"description": "Solo el admin puede listar usuarios"},
    },
)
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_active_admin)],
) -> list[User]:
    """Listar todos los usuarios del sistema. Requiere rol admin."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.patch(
    "/{user_id}",
    response_model=UserResponse,
    tags=["users"],
    responses={
        401: {"description": "Token inválido o expirado"},
        403: {"description": "Solo el admin puede editar usuarios"},
        404: {"description": "Usuario no encontrado"},
        409: {"description": "El email ya está en uso por otro usuario"},
    },
)
async def update_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_active_admin)],
    user_id: UUID,
    user_in: UserUpdate,
) -> User:
    """Actualizar nombre, email, rol o estado de un usuario. Requiere rol admin."""
    user = await _get_user_or_404(db, user_id)

    # Check email uniqueness if it's being changed
    if user_in.email and user_in.email != user.email:
        conflict = await db.execute(select(User).where(User.email == user_in.email))
        if conflict.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El email ya está registrado por otro usuario",
            )

    update_data = user_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return user


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["users"],
    responses={
        400: {"description": "El admin no puede eliminarse a sí mismo"},
        401: {"description": "Token inválido o expirado"},
        403: {"description": "Solo el admin puede eliminar usuarios"},
        404: {"description": "Usuario no encontrado"},
    },
)
async def delete_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    user_id: UUID,
) -> None:
    """Eliminar un usuario del sistema. El admin no puede eliminarse a sí mismo. Requiere rol admin."""
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No podés eliminarte a vos mismo",
        )

    user = await _get_user_or_404(db, user_id)
    await db.delete(user)
    await db.commit()


@router.post(
    "/{user_id}/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["users"],
    responses={
        401: {"description": "Token inválido o expirado"},
        403: {"description": "Solo el admin puede cambiar contraseñas"},
        404: {"description": "Usuario no encontrado"},
    },
)
async def change_user_password(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_active_admin)],
    user_id: UUID,
    payload: UserPasswordChange,
) -> None:
    """Cambiar la contraseña de un usuario. Requiere rol admin."""
    user = await _get_user_or_404(db, user_id)
    user.hashed_password = get_password_hash(payload.new_password)
    user.must_change_password = False
    await db.commit()
