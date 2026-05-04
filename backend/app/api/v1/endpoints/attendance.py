from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_active_admin, get_current_user
from app.models.attendance import AttendanceRecord
from app.models.employee import Employee
from app.models.location import Location
from app.models.user import User
from app.schemas.attendance import (
    AttendanceCheckIn,
    AttendanceCheckOut,
    AttendanceResponse,
)
from app.services.face_recognition import FaceRecognitionService
from app.services.geolocation import validate_location

router = APIRouter()


async def _validate_geo(
    db: AsyncSession,
    employee: Employee,
    latitude: float | None,
    longitude: float | None,
) -> tuple[bool, float | None]:
    """
    Validate geolocation for an employee.
    Returns (is_valid, distance_meters).
    If no location assigned or no coordinates provided, returns (False, None).
    """
    if latitude is None or longitude is None:
        return False, None

    if employee.location_id is None:
        # No location assigned, can't validate but allow with warning
        return False, None

    # Get location
    result = await db.execute(
        select(Location).where(Location.id == employee.location_id)
    )
    location = result.scalar_one_or_none()

    if not location:
        return False, None

    validation = validate_location(
        user_lat=latitude,
        user_lon=longitude,
        location_lat=location.latitude,
        location_lon=location.longitude,
        radius_meters=location.radius_meters,
        location_name=location.name,
    )

    return validation.is_valid, validation.distance_meters


def _require_gps_coordinates(latitude: float | None, longitude: float | None) -> None:
    """Attendance marking requires real GPS coordinates."""
    if latitude is None or longitude is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GPS coordinates are required to validate attendance location",
        )


def _reject_if_outside_perimeter(distance: float | None) -> None:
    """Reject attendance when device is outside the allowed radius."""
    detail = "Outside permitted area"
    if distance is not None:
        detail += f": {distance:.0f}m"

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=detail,
    )


@router.post(
    "/check-in",
    response_model=AttendanceResponse,
    tags=["attendance"],
    responses={
        400: {"description": "No se detectó rostro en la imagen o error al procesarla"},
        404: {"description": "Ningún empleado coincide con el rostro enviado"},
        422: {
            "description": "Error de validación — coordenadas inválidas o imágenes faltantes"
        },
    },
)
async def check_in(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: AttendanceCheckIn,
) -> AttendanceResponse:
    """
    Registrar entrada de un catedrático por reconocimiento facial.

    No requiere autenticación. El rostro en las imágenes es la credencial.

    **Proceso interno:**
    1. Extrae el embedding facial de `images[0]` usando dlib (face_recognition)
    2. Busca el empleado más parecido en la DB con pgvector (distancia coseno)
    3. Si la distancia supera el umbral (0.6), devuelve 404
    4. Valida geolocalización contra la sede asignada al empleado (Haversine)
    5. Registra la entrada con hora, confianza facial y resultado GPS

    **Nota:** Si el empleado ya tiene check-in hoy, devuelve el registro existente
    con `message` indicando la hora del check-in previo. La geolocalización es
    **obligatoria** y el marcaje se rechaza si está fuera del perímetro permitido.
    """
    face_service = FaceRecognitionService()

    # Extract embeddings from ALL frames for liveness detection
    all_embeddings: list = []
    try:
        for img_b64 in request.images:
            emb = face_service.get_face_embedding(img_b64)
            if emb is not None:
                all_embeddings.append(emb)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing image: {str(e)}",
        )

    if not all_embeddings:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No face detected in the provided images",
        )

    # Liveness check: require variance between frames
    if len(all_embeddings) >= 2:
        is_live, variance = face_service.check_liveness_from_embeddings(all_embeddings)
        if not is_live:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Liveness check failed: static image detected. Please use your real face.",
            )

    query_embedding = all_embeddings[0]

    # Find best match
    match = await face_service.find_best_match(db, query_embedding)

    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No matching employee found",
        )

    employee, confidence = match
    today = date.today()
    now = datetime.utcnow()

    # Check if already checked in today
    result = await db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id == employee.id,
            AttendanceRecord.record_date == today,
        )
    )
    attendance = result.scalar_one_or_none()

    if attendance:
        if attendance.check_in:
            return AttendanceResponse(
                id=attendance.id,
                employee_id=employee.id,
                employee_name=employee.full_name,
                record_date=today,
                check_in=attendance.check_in,
                check_out=attendance.check_out,
                status=attendance.status,
                confidence=confidence,
                geo_validated=attendance.geo_validated,
                distance_meters=attendance.check_in_distance_meters,
                message=f"Already checked in at {attendance.check_in.strftime('%H:%M')}",
            )
    else:
        attendance = AttendanceRecord(
            employee_id=employee.id,
            record_date=today,
        )
        db.add(attendance)

    _require_gps_coordinates(request.latitude, request.longitude)

    # Validate geolocation
    geo_valid, distance = await _validate_geo(
        db, employee, request.latitude, request.longitude
    )

    if not geo_valid:
        _reject_if_outside_perimeter(distance)

    attendance.check_in = now
    attendance.check_in_confidence = confidence
    attendance.status = "present"

    # Store geolocation data
    attendance.check_in_latitude = request.latitude
    attendance.check_in_longitude = request.longitude
    attendance.check_in_distance_meters = distance
    attendance.geo_validated = geo_valid

    await db.commit()
    await db.refresh(attendance)

    # Build message
    message = f"Welcome, {employee.full_name}! Check-in at {now.strftime('%H:%M')}"
    if not geo_valid and request.latitude is not None:
        if distance:
            message += f" (Outside permitted area: {distance:.0f}m)"
        else:
            message += " (No location assigned)"

    return AttendanceResponse(
        id=attendance.id,
        employee_id=employee.id,
        employee_name=employee.full_name,
        record_date=today,
        check_in=attendance.check_in,
        check_out=attendance.check_out,
        status=attendance.status,
        confidence=confidence,
        geo_validated=geo_valid,
        distance_meters=distance,
        check_in_latitude=attendance.check_in_latitude,
        check_in_longitude=attendance.check_in_longitude,
        check_in_distance_meters=attendance.check_in_distance_meters,
        check_out_latitude=attendance.check_out_latitude,
        check_out_longitude=attendance.check_out_longitude,
        check_out_distance_meters=attendance.check_out_distance_meters,
        message=message,
    )


@router.post(
    "/check-out",
    response_model=AttendanceResponse,
    tags=["attendance"],
    responses={
        400: {
            "description": "No se detectó rostro, error de imagen, o no existe check-in previo para hoy"
        },
        404: {"description": "Ningún empleado coincide con el rostro enviado"},
        422: {
            "description": "Error de validación — coordenadas inválidas o imágenes faltantes"
        },
    },
)
async def check_out(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: AttendanceCheckOut,
) -> AttendanceResponse:
    """
    Registrar salida de un catedrático por reconocimiento facial.

    No requiere autenticación. El rostro en las imágenes es la credencial.

    **Proceso interno:**
    1. Identifica al empleado por reconocimiento facial (igual que check-in)
    2. Busca el registro de asistencia de hoy para ese empleado
    3. Si no existe check-in previo, devuelve 400
    4. Valida geolocalización y registra la salida con hora y confianza
    5. `geo_validated` se mantiene `true` solo si tanto check-in como check-out fueron válidos

    **Nota:** Si el empleado ya tiene check-out hoy, devuelve el registro existente
    con `message` indicando la hora del check-out previo. La geolocalización es
    obligatoria y el marcaje se rechaza si está fuera del perímetro permitido.
    """
    face_service = FaceRecognitionService()

    # Extract embeddings from ALL frames for liveness detection
    all_embeddings: list = []
    try:
        for img_b64 in request.images:
            emb = face_service.get_face_embedding(img_b64)
            if emb is not None:
                all_embeddings.append(emb)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing image: {str(e)}",
        )

    if not all_embeddings:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No face detected in the provided images",
        )

    # Liveness check: require variance between frames
    if len(all_embeddings) >= 2:
        is_live, variance = face_service.check_liveness_from_embeddings(all_embeddings)
        if not is_live:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Liveness check failed: static image detected. Please use your real face.",
            )

    query_embedding = all_embeddings[0]

    match = await face_service.find_best_match(db, query_embedding)

    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No matching employee found",
        )

    employee, confidence = match
    today = date.today()
    now = datetime.utcnow()

    result = await db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id == employee.id,
            AttendanceRecord.record_date == today,
        )
    )
    attendance = result.scalar_one_or_none()

    if not attendance or not attendance.check_in:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No check-in record found for today. Please check in first.",
        )

    if attendance.check_out:
        return AttendanceResponse(
            id=attendance.id,
            employee_id=employee.id,
            employee_name=employee.full_name,
            record_date=today,
            check_in=attendance.check_in,
            check_out=attendance.check_out,
            status=attendance.status,
            confidence=confidence,
            geo_validated=attendance.geo_validated,
            distance_meters=attendance.check_out_distance_meters,
            message=f"Already checked out at {attendance.check_out.strftime('%H:%M')}",
        )

    _require_gps_coordinates(request.latitude, request.longitude)

    # Validate geolocation
    geo_valid, distance = await _validate_geo(
        db, employee, request.latitude, request.longitude
    )

    if not geo_valid:
        _reject_if_outside_perimeter(distance)

    attendance.check_out = now
    attendance.check_out_confidence = confidence

    # Store geolocation data for check-out
    attendance.check_out_latitude = request.latitude
    attendance.check_out_longitude = request.longitude
    attendance.check_out_distance_meters = distance

    # Update geo_validated: only true if both check-in and check-out were validated
    # Keep as true if check-in was valid and check-out is valid too
    if attendance.geo_validated and not geo_valid:
        attendance.geo_validated = False

    await db.commit()
    await db.refresh(attendance)

    # Build message
    message = f"Goodbye, {employee.full_name}! Check-out at {now.strftime('%H:%M')}"
    if not geo_valid and request.latitude is not None:
        if distance:
            message += f" (Outside permitted area: {distance:.0f}m)"
        else:
            message += " (No location assigned)"

    return AttendanceResponse(
        id=attendance.id,
        employee_id=employee.id,
        employee_name=employee.full_name,
        record_date=today,
        check_in=attendance.check_in,
        check_out=attendance.check_out,
        status=attendance.status,
        confidence=confidence,
        geo_validated=attendance.geo_validated,
        distance_meters=distance,
        check_in_latitude=attendance.check_in_latitude,
        check_in_longitude=attendance.check_in_longitude,
        check_in_distance_meters=attendance.check_in_distance_meters,
        check_out_latitude=attendance.check_out_latitude,
        check_out_longitude=attendance.check_out_longitude,
        check_out_distance_meters=attendance.check_out_distance_meters,
        message=message,
    )


@router.get(
    "/",
    response_model=list[AttendanceResponse],
    tags=["attendance"],
    responses={
        401: {"description": "Token inválido o expirado"},
    },
)
async def list_attendance(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    record_date: date | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    employee_id: UUID | None = None,
    status: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> list[AttendanceResponse]:
    """
    Listar registros de asistencia con filtros opcionales. Requiere autenticación.

    **Filtros disponibles (todos opcionales, combinables):**
    - `record_date` — fecha exacta (YYYY-MM-DD)
    - `date_from` / `date_to` — rango de fechas (inclusive en ambos extremos)
    - `employee_id` — UUID del empleado
    - `status` — estado del registro (`present`, `absent`, `late`)

    **Paginación:** usar `skip` y `limit` (máx. 1000 por request).
    Los resultados se ordenan por fecha descendente.
    """
    query = select(AttendanceRecord).options(selectinload(AttendanceRecord.employee))

    # Single date filter (backwards compatible)
    if record_date:
        query = query.where(AttendanceRecord.record_date == record_date)
    # Date range filter
    if date_from:
        query = query.where(AttendanceRecord.record_date >= date_from)
    if date_to:
        query = query.where(AttendanceRecord.record_date <= date_to)
    if employee_id:
        query = query.where(AttendanceRecord.employee_id == employee_id)
    if status:
        query = query.where(AttendanceRecord.status == status)

    query = (
        query.offset(skip).limit(limit).order_by(AttendanceRecord.record_date.desc())
    )

    result = await db.execute(query)
    records = result.scalars().all()

    return [
        AttendanceResponse(
            id=r.id,
            employee_id=r.employee_id,
            employee_name=r.employee.full_name,
            record_date=r.record_date,
            check_in=r.check_in,
            check_out=r.check_out,
            status=r.status,
            confidence=r.check_in_confidence,
            geo_validated=r.geo_validated,
            distance_meters=r.check_in_distance_meters,
            check_in_latitude=r.check_in_latitude,
            check_in_longitude=r.check_in_longitude,
            check_in_distance_meters=r.check_in_distance_meters,
            check_out_latitude=r.check_out_latitude,
            check_out_longitude=r.check_out_longitude,
            check_out_distance_meters=r.check_out_distance_meters,
        )
        for r in records
    ]


@router.get(
    "/today",
    response_model=list[AttendanceResponse],
    tags=["attendance"],
    responses={
        401: {"description": "Token inválido o expirado"},
    },
)
async def list_today_attendance(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[AttendanceResponse]:
    """
    Listar todos los registros de asistencia del día de hoy. Requiere autenticación.

    Shortcut de `GET /` filtrado por la fecha actual del servidor.
    Los resultados se ordenan por hora de check-in descendente (el más reciente primero).
    Útil para el dashboard en tiempo real y el kiosk de supervisión.
    """
    today = date.today()

    query = (
        select(AttendanceRecord)
        .options(selectinload(AttendanceRecord.employee))
        .where(AttendanceRecord.record_date == today)
        .order_by(AttendanceRecord.check_in.desc())
    )

    result = await db.execute(query)
    records = result.scalars().all()

    return [
        AttendanceResponse(
            id=r.id,
            employee_id=r.employee_id,
            employee_name=r.employee.full_name,
            record_date=r.record_date,
            check_in=r.check_in,
            check_out=r.check_out,
            status=r.status,
            confidence=r.check_in_confidence,
            geo_validated=r.geo_validated,
            distance_meters=r.check_in_distance_meters,
            check_in_latitude=r.check_in_latitude,
            check_in_longitude=r.check_in_longitude,
            check_in_distance_meters=r.check_in_distance_meters,
            check_out_latitude=r.check_out_latitude,
            check_out_longitude=r.check_out_longitude,
            check_out_distance_meters=r.check_out_distance_meters,
        )
        for r in records
    ]
