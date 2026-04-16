from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.models.user import User
from app.schemas.user import Token, UserCreate, UserResponse

router = APIRouter()


@router.post(
    "/login",
    response_model=Token,
    tags=["auth"],
    responses={
        401: {"description": "Email o contraseña incorrectos"},
        403: {"description": "Usuario inactivo — cuenta deshabilitada"},
    },
)
async def login(
    db: Annotated[AsyncSession, Depends(get_db)],
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    """
    Autenticar un usuario y obtener tokens JWT.

    **Formato del request:** `application/x-www-form-urlencoded` (NO JSON).
    Usar los campos `username` (email) y `password`.

    En Swagger UI: click en **Authorize** arriba a la derecha, ingresar email y password.
    En Postman/Insomnia: body tipo `form-data` o `x-www-form-urlencoded`.

    **Respuesta:**
    - `access_token` — válido por 30 minutos. Usar en el header `Authorization: Bearer <token>`
    - `refresh_token` — válido por 7 días. Usar en `POST /refresh` para renovar el access token
    """
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )

    return Token(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["auth"],
    responses={
        400: {"description": "El email ya está registrado"},
    },
)
async def register(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_in: UserCreate,
) -> User:
    """
    Registrar un nuevo usuario administrador del sistema.

    Este endpoint crea usuarios con acceso al panel de administración.
    No confundir con el registro de empleados (`POST /employees/`) —
    los empleados son las personas cuya asistencia se controla,
    los usuarios son quienes administran el sistema.

    El email debe ser único. La contraseña se hashea con bcrypt antes de guardarse.
    """
    result = await db.execute(select(User).where(User.email == user_in.email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


@router.post(
    "/refresh",
    response_model=Token,
    tags=["auth"],
    responses={
        401: {"description": "Refresh token inválido, expirado o usuario inactivo"},
    },
)
async def refresh_token(
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh_token: str,
) -> Token:
    """
    Renovar el access token usando un refresh token válido.

    El access token expira en 30 minutos. Cuando recibas un 401 en cualquier
    endpoint protegido, usá este endpoint con el `refresh_token` obtenido en el login
    para obtener un nuevo par de tokens sin pedir las credenciales de nuevo.

    El refresh token expira en 7 días. Si también está expirado, el usuario debe
    volver a hacer login.
    """
    payload = decode_token(refresh_token)

    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    return Token(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    tags=["auth"],
    responses={
        401: {"description": "Token inválido o expirado"},
    },
)
async def get_current_user_info(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Obtener los datos del usuario autenticado actualmente.

    Útil para verificar que el token es válido y conocer el rol del usuario
    sin hacer otra llamada. También sirve como health-check de autenticación
    desde el frontend al cargar la aplicación.
    """
    return current_user
