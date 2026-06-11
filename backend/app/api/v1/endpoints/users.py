from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    ensure_can_assign_role,
    get_db,
    get_current_active_admin,
    protect_bootstrap_admin_mutation,
    settings,
)
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
    current_user: Annotated[User, Depends(get_current_active_admin)],
    configured_settings=settings,
) -> list[User]:
    """Listar todos los usuarios del sistema. Requiere rol admin."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return [
        user
        for user in result.scalars().all()
        if not protect_bootstrap_admin_list_item(user, current_user, configured_settings)
    ]


def protect_bootstrap_admin_list_item(user: User, actor: User, configured_settings=settings) -> bool:
    return user.email.casefold() == configured_settings.bootstrap_admin_email.casefold() and (
        actor.email.casefold() != configured_settings.bootstrap_admin_email.casefold()
    )


def _ensure_bootstrap_email_is_not_assigned(email: str | None, configured_settings=settings) -> None:
    if email and email.casefold() == configured_settings.bootstrap_admin_email.casefold():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Reserved bootstrap admin email cannot be assigned through users API",
        )


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
    current_user: Annotated[User, Depends(get_current_active_admin)],
    user_id: UUID,
    user_in: UserUpdate,
    configured_settings=settings,
) -> User:
    """Actualizar nombre, email, rol o estado de un usuario. Requiere rol admin."""
    user = await _get_user_or_404(db, user_id)
    protect_bootstrap_admin_mutation(user, current_user, configured_settings)

    if user_in.role is not None:
        ensure_can_assign_role(current_user, user_in.role, configured_settings)

    _ensure_bootstrap_email_is_not_assigned(user_in.email, configured_settings)

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
    configured_settings=settings,
) -> None:
    """Eliminar un usuario del sistema. El admin no puede eliminarse a sí mismo. Requiere rol admin."""
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No podés eliminarte a vos mismo",
        )

    user = await _get_user_or_404(db, user_id)
    protect_bootstrap_admin_mutation(user, current_user, configured_settings)
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
    current_user: Annotated[User, Depends(get_current_active_admin)],
    user_id: UUID,
    payload: UserPasswordChange,
    configured_settings=settings,
) -> None:
    """Cambiar la contraseña de un usuario. Requiere rol admin."""
    user = await _get_user_or_404(db, user_id)
    protect_bootstrap_admin_mutation(user, current_user, configured_settings)
    user.hashed_password = get_password_hash(payload.new_password)
    user.must_change_password = False
    await db.commit()
