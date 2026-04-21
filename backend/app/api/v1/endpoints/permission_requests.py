from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    get_current_coordinador_or_above,
    get_db,
)
from app.models.permission_request import (
    PermissionRequest,
    PermissionRequestStatus,
    RejectionStage,
)
from app.models.schedule import ScheduleException
from app.models.user import User, UserRole
from app.schemas.permission_request import (
    PermissionRequestApprove,
    PermissionRequestCreate,
    PermissionRequestReject,
    PermissionRequestResponse,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /permission-requests  — any authenticated user
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=PermissionRequestResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["permission-requests"],
    responses={
        422: {"description": "La solicitud debe realizarse con al menos 7 días de anticipación"},
    },
)
async def create_permission_request(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request_in: PermissionRequestCreate,
) -> PermissionRequestResponse:
    """
    Crear una solicitud de permiso. Requiere autenticación.

    La `start_date` debe ser al menos 7 días posterior a la fecha de hoy.
    La solicitud queda en estado `pending` hasta que un coordinador la apruebe.
    """
    permission_request = PermissionRequest(
        requested_by_user_id=current_user.id,
        employee_id=request_in.employee_id,
        exception_type=request_in.exception_type,
        start_date=request_in.start_date,
        end_date=request_in.end_date,
        description=request_in.description,
        status=PermissionRequestStatus.pending,
    )
    db.add(permission_request)
    await db.commit()
    await db.refresh(permission_request)
    return PermissionRequestResponse.model_validate(permission_request)


# ---------------------------------------------------------------------------
# GET /permission-requests  — role-based visibility
# ---------------------------------------------------------------------------

@router.get(
    "/",
    response_model=list[PermissionRequestResponse],
    tags=["permission-requests"],
)
async def list_permission_requests(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: PermissionRequestStatus | None = Query(None, alias="status"),
    employee_id: UUID | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
) -> list[PermissionRequestResponse]:
    """
    Listar solicitudes de permiso.

    - `admin`, `director`, `coordinador`: ven **todas** las solicitudes.
    - `secretaria`, `catedratico`: ven únicamente sus propias solicitudes.

    Filtros opcionales: `status`, `employee_id`.
    """
    _privileged = {UserRole.admin, UserRole.director, UserRole.coordinador}

    query = select(PermissionRequest)

    if current_user.role not in _privileged:
        # Restrict to own requests
        query = query.where(PermissionRequest.requested_by_user_id == current_user.id)

    if status_filter is not None:
        query = query.where(PermissionRequest.status == status_filter)
    if employee_id is not None:
        query = query.where(PermissionRequest.employee_id == employee_id)

    query = query.offset(skip).limit(limit).order_by(PermissionRequest.created_at.desc())

    result = await db.execute(query)
    records = result.scalars().all()
    return [PermissionRequestResponse.model_validate(r) for r in records]


# ---------------------------------------------------------------------------
# GET /permission-requests/{request_id}
# ---------------------------------------------------------------------------

@router.get(
    "/{request_id}",
    response_model=PermissionRequestResponse,
    tags=["permission-requests"],
    responses={
        403: {"description": "No autorizado para ver esta solicitud"},
        404: {"description": "Solicitud no encontrada"},
    },
)
async def get_permission_request(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request_id: UUID,
) -> PermissionRequestResponse:
    """
    Obtener una solicitud de permiso por su UUID.

    - `admin`, `director`, `coordinador`: pueden ver cualquier solicitud.
    - `secretaria`, `catedratico`: solo las propias.
    """
    result = await db.execute(
        select(PermissionRequest).where(PermissionRequest.id == request_id)
    )
    permission_request = result.scalar_one_or_none()

    if not permission_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada",
        )

    _privileged = {UserRole.admin, UserRole.director, UserRole.coordinador}
    if current_user.role not in _privileged:
        if permission_request.requested_by_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No autorizado para ver esta solicitud",
            )

    return PermissionRequestResponse.model_validate(permission_request)


# ---------------------------------------------------------------------------
# PATCH /permission-requests/{request_id}/approve
# ---------------------------------------------------------------------------

@router.patch(
    "/{request_id}/approve",
    response_model=PermissionRequestResponse,
    tags=["permission-requests"],
    responses={
        400: {"description": "No se puede aprobar en el estado actual"},
        403: {"description": "Permisos insuficientes para esta etapa de aprobación"},
        404: {"description": "Solicitud no encontrada"},
    },
)
async def approve_permission_request(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_coordinador_or_above)],
    request_id: UUID,
    body: PermissionRequestApprove,
) -> PermissionRequestResponse:
    """
    Aprobar una solicitud de permiso.

    **Flujo de aprobación en dos etapas:**

    1. `pending` → `coordinator_approved` (requiere rol `coordinador` o `admin`)
    2. `coordinator_approved` → `approved` (requiere rol `director` o `admin`)
       Al alcanzar `approved`, se crea automáticamente un `ScheduleException` vinculado.
    """
    result = await db.execute(
        select(PermissionRequest).where(PermissionRequest.id == request_id)
    )
    permission_request = result.scalar_one_or_none()

    if not permission_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada",
        )

    now = datetime.utcnow()

    if permission_request.status == PermissionRequestStatus.pending:
        # Stage 1: coordinator approval
        _allowed = {UserRole.coordinador, UserRole.admin}
        if current_user.role not in _allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes: se requiere rol coordinador o admin",
            )
        permission_request.status = PermissionRequestStatus.coordinator_approved
        permission_request.coordinator_reviewed_by = current_user.id
        permission_request.coordinator_reviewed_at = now
        permission_request.coordinator_notes = body.notes

    elif permission_request.status == PermissionRequestStatus.coordinator_approved:
        # Stage 2: director approval
        _allowed = {UserRole.director, UserRole.admin}
        if current_user.role not in _allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes: se requiere rol director o admin",
            )
        permission_request.status = PermissionRequestStatus.approved
        permission_request.director_reviewed_by = current_user.id
        permission_request.director_reviewed_at = now
        permission_request.director_notes = body.notes

        # Auto-create ScheduleException
        schedule_exception = ScheduleException(
            employee_id=permission_request.employee_id,
            exception_type=permission_request.exception_type,
            start_date=permission_request.start_date,
            end_date=permission_request.end_date,
            description=permission_request.description,
            created_by=current_user.id,
        )
        db.add(schedule_exception)
        await db.flush()  # Get the id without committing yet
        permission_request.schedule_exception_id = schedule_exception.id

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede aprobar en el estado actual",
        )

    await db.commit()
    await db.refresh(permission_request)
    return PermissionRequestResponse.model_validate(permission_request)


# ---------------------------------------------------------------------------
# PATCH /permission-requests/{request_id}/reject
# ---------------------------------------------------------------------------

@router.patch(
    "/{request_id}/reject",
    response_model=PermissionRequestResponse,
    tags=["permission-requests"],
    responses={
        400: {"description": "No se puede rechazar en el estado actual"},
        403: {"description": "Permisos insuficientes para esta etapa"},
        404: {"description": "Solicitud no encontrada"},
    },
)
async def reject_permission_request(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_coordinador_or_above)],
    request_id: UUID,
    body: PermissionRequestReject,
) -> PermissionRequestResponse:
    """
    Rechazar una solicitud de permiso.

    - Estado `pending`: requiere `coordinador` o `admin`.
    - Estado `coordinator_approved`: requiere `director` o `admin`.
    """
    result = await db.execute(
        select(PermissionRequest).where(PermissionRequest.id == request_id)
    )
    permission_request = result.scalar_one_or_none()

    if not permission_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada",
        )

    if permission_request.status == PermissionRequestStatus.pending:
        _allowed = {UserRole.coordinador, UserRole.admin}
        if current_user.role not in _allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes: se requiere rol coordinador o admin",
            )
        permission_request.rejection_stage = RejectionStage.coordinator

    elif permission_request.status == PermissionRequestStatus.coordinator_approved:
        _allowed = {UserRole.director, UserRole.admin}
        if current_user.role not in _allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes: se requiere rol director o admin",
            )
        permission_request.rejection_stage = RejectionStage.director

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede rechazar en el estado actual",
        )

    permission_request.status = PermissionRequestStatus.rejected
    permission_request.rejection_reason = body.rejection_reason

    await db.commit()
    await db.refresh(permission_request)
    return PermissionRequestResponse.model_validate(permission_request)


# ---------------------------------------------------------------------------
# DELETE /permission-requests/{request_id}
# ---------------------------------------------------------------------------

@router.delete(
    "/{request_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["permission-requests"],
    responses={
        403: {"description": "Solo se puede eliminar una solicitud propia en estado pending"},
        404: {"description": "Solicitud no encontrada"},
    },
)
async def delete_permission_request(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request_id: UUID,
) -> None:
    """
    Eliminar una solicitud de permiso.

    - Solo se puede eliminar si el estado es `pending`.
    - El usuario debe ser el creador de la solicitud, o tener rol `admin`.
    """
    result = await db.execute(
        select(PermissionRequest).where(PermissionRequest.id == request_id)
    )
    permission_request = result.scalar_one_or_none()

    if not permission_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada",
        )

    is_admin = current_user.role == UserRole.admin
    is_owner = permission_request.requested_by_user_id == current_user.id

    if not is_admin:
        if not is_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No autorizado para eliminar esta solicitud",
            )
        if permission_request.status != PermissionRequestStatus.pending:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo se pueden eliminar solicitudes en estado pending",
            )

    await db.delete(permission_request)
    await db.commit()
