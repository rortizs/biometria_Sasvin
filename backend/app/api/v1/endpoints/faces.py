import logging
import uuid
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import get_db, get_current_active_admin
from app.models.biometric_face_session import BiometricFaceSession
from app.models.employee import Employee
from app.models.face_embedding import FaceEmbedding
from app.models.user import User
from app.schemas.face import (
    FaceRegisterRequest,
    FaceVerifyRequest,
    FaceVerifyResponse,
    StageMetrics,
)
from app.services.face_recognition import FaceRecognitionService

router = APIRouter()
logger = logging.getLogger("app.api.faces")


def _calculate_liveness_delta(metrics: StageMetrics | None) -> Decimal | None:
    if metrics is None:
        return None

    delta_seconds = (metrics.review - metrics.capture).total_seconds()
    if delta_seconds < 0:
        return None

    return Decimal(str(delta_seconds)).quantize(
        Decimal("0.000001"), rounding=ROUND_HALF_UP
    )


@router.post(
    "/register",
    response_model=dict,
    tags=["faces"],
    responses={
        400: {"description": "No se detectó rostro válido en ninguna de las imágenes"},
        404: {"description": "El empleado no existe"},
    },
)
async def register_face(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    request: FaceRegisterRequest,
) -> dict:
    """
    Registrar el embedding facial de un empleado. Requiere rol admin.

    **Proceso interno:**
    1. Verifica que el empleado exista en la DB
    2. Procesa cada imagen con dlib para extraer embeddings de 128 dimensiones
    3. Elimina los embeddings anteriores del empleado (si los había)
    4. Guarda los nuevos embeddings en PostgreSQL (pgvector)
    5. El primer embedding (`is_primary=True`) se usa como referencia principal

    **Recomendaciones para mejor precisión:**
    - Enviar 3–5 fotos con distintos ángulos (frontal, leve perfil izquierdo/derecho)
    - Buena iluminación uniforme, sin sombras fuertes
    - Resolución mínima 200×200 px por imagen

    **Nota:** El registro reemplaza todos los embeddings previos del empleado.
    Después de registrar, el campo `has_face_registered` del empleado pasa a `true`.
    """
    # Verify employee exists
    result = await db.execute(
        select(Employee).where(Employee.id == request.employee_id)
    )
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )

    stage_metrics_payload = (
        request.stage_metrics.model_dump(mode="json") if request.stage_metrics else None
    )
    session_identifier = request.session_id or str(uuid.uuid4())
    biometric_session = BiometricFaceSession(
        employee_id=request.employee_id,
        session_id=session_identifier,
        stage_metrics=stage_metrics_payload,
        capture_origin=request.capture_origin,
        started_at=datetime.utcnow(),
        status="started",
    )

    db.add(biometric_session)

    try:
        await db.flush()
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.exception(
            "biometric_face_session_init_failed",
            extra={
                "session_id": session_identifier,
                "employee_id": str(request.employee_id),
                "status": "init_failed",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize biometric face session",
        ) from exc

    logger.info(
        "biometric_face_session_started",
        extra={
            "session_id": session_identifier,
            "employee_id": str(request.employee_id),
            "status": "started",
        },
    )

    face_service = FaceRecognitionService()

    try:
        embeddings: list = []
        for idx, image_b64 in enumerate(request.images):
            try:
                embedding = face_service.get_face_embedding(image_b64)
                if embedding is not None:
                    embeddings.append(embedding)
            except Exception as e:  # noqa: BLE001
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Error processing image {idx + 1}: {str(e)}",
                )

        if not embeddings:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid face found in any of the provided images",
            )

        existing = await db.execute(
            select(FaceEmbedding).where(
                FaceEmbedding.employee_id == request.employee_id
            )
        )
        for emb in existing.scalars().all():
            await db.delete(emb)

        for idx, embedding in enumerate(embeddings):
            face_emb = FaceEmbedding(
                employee_id=request.employee_id,
                embedding=embedding.tolist(),
                is_primary=(idx == 0),
            )
            db.add(face_emb)

        biometric_session.status = "completed"
        biometric_session.completed_at = datetime.utcnow()
        biometric_session.liveness_delta = _calculate_liveness_delta(
            request.stage_metrics
        )

        await db.commit()
    except HTTPException:
        await db.rollback()
        logger.info(
            "biometric_face_session_failed",
            extra={
                "session_id": session_identifier,
                "employee_id": str(request.employee_id),
                "status": "failed",
            },
        )
        raise
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        logger.exception(
            "biometric_face_session_error",
            extra={
                "session_id": session_identifier,
                "employee_id": str(request.employee_id),
                "status": "error",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to register biometric face session",
        ) from exc

    logger.info(
        "biometric_face_session_completed",
        extra={
            "session_id": session_identifier,
            "employee_id": str(request.employee_id),
            "status": "completed",
        },
    )

    return {
        "success": True,
        "message": f"Registered {len(embeddings)} face embedding(s) for {employee.full_name}",
        "embeddings_count": len(embeddings),
    }


@router.post(
    "/verify",
    response_model=FaceVerifyResponse,
    tags=["faces"],
    responses={
        200: {"description": "Verificación completada — `success: true` si hay match, `false` si no"},
    },
)
async def verify_face(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: FaceVerifyRequest,
) -> FaceVerifyResponse:
    """
    Verificar a qué empleado pertenece un rostro. No requiere autenticación.

    A diferencia de check-in/check-out, este endpoint **no registra asistencia** —
    solo identifica al empleado y devuelve su nombre y nivel de confianza.
    Útil para diagnóstico y pruebas del sistema de reconocimiento facial.

    **Respuesta:** Siempre devuelve 200. El campo `success` indica si hubo match:
    - `success: true` → empleado identificado, incluye `employee_id`, `employee_name` y `confidence`
    - `success: false` → sin match o imagen inválida, incluye `message` con el motivo
    """
    face_service = FaceRecognitionService()

    # Get embedding from provided image
    try:
        query_embedding = face_service.get_face_embedding(request.image)
    except Exception as e:
        return FaceVerifyResponse(
            success=False,
            message=f"Error processing image: {str(e)}",
        )

    if query_embedding is None:
        return FaceVerifyResponse(
            success=False,
            message="No face detected in the provided image",
        )

    # Find best match using pgvector
    match = await face_service.find_best_match(db, query_embedding)

    if match is None:
        return FaceVerifyResponse(
            success=False,
            message="No matching employee found",
        )

    employee, confidence = match

    return FaceVerifyResponse(
        success=True,
        employee_id=employee.id,
        employee_name=employee.full_name,
        confidence=confidence,
        message=f"Welcome, {employee.full_name}!",
    )


@router.delete(
    "/{employee_id}",
    tags=["faces"],
    responses={
        404: {"description": "El empleado no tiene embeddings registrados"},
    },
)
async def delete_face_embeddings(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    employee_id: UUID,
) -> dict:
    """
    Eliminar todos los embeddings faciales de un empleado. Requiere rol admin.

    Después de eliminar, el campo `has_face_registered` del empleado pasa a `false`
    y no podrá hacer check-in/check-out hasta que se registren nuevos embeddings.

    Útil para: re-registrar con mejores fotos, dar de baja a un empleado,
    o corregir un registro incorrecto.
    """
    result = await db.execute(
        select(FaceEmbedding).where(FaceEmbedding.employee_id == employee_id)
    )
    embeddings = result.scalars().all()

    if not embeddings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No face embeddings found for this employee",
        )

    for emb in embeddings:
        await db.delete(emb)

    await db.commit()

    return {
        "success": True,
        "message": f"Deleted {len(embeddings)} face embedding(s)",
    }
