from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_active_admin
from app.models.attendance import AttendanceRecord
from app.models.employee import Employee
from app.models.location import Location
from app.models.user import User
from app.schemas.attendance import AttendanceCheckIn, AttendanceCheckOut, AttendanceResponse
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


@router.post("/check-in", response_model=AttendanceResponse)
async def check_in(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: AttendanceCheckIn,
) -> AttendanceResponse:
    face_service = FaceRecognitionService()

    # Get embedding from provided image
    try:
        query_embedding = face_service.get_face_embedding(request.image)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing image: {str(e)}",
        )

    if query_embedding is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No face detected in the provided image",
        )

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

    # Validate geolocation
    geo_valid, distance = await _validate_geo(
        db, employee, request.latitude, request.longitude
    )

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
        message=message,
    )


@router.post("/check-out", response_model=AttendanceResponse)
async def check_out(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: AttendanceCheckOut,
) -> AttendanceResponse:
    face_service = FaceRecognitionService()

    try:
        query_embedding = face_service.get_face_embedding(request.image)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing image: {str(e)}",
        )

    if query_embedding is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No face detected in the provided image",
        )

    match = await face_service.find_best_match(db, query_embedding)

    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No matching employee found",
        )

    employee, confidence = match
    today = date.today()
    now = datetime.utcnow()

    # Validate geolocation
    geo_valid, distance = await _validate_geo(
        db, employee, request.latitude, request.longitude
    )

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
        message=message,
    )


@router.get("/", response_model=list[AttendanceResponse])
async def list_attendance(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    record_date: date | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    employee_id: UUID | None = None,
    status: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> list[AttendanceResponse]:
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

    query = query.offset(skip).limit(limit).order_by(AttendanceRecord.record_date.desc())

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
        )
        for r in records
    ]


@router.get("/today", response_model=list[AttendanceResponse])
async def list_today_attendance(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
) -> list[AttendanceResponse]:
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
        )
        for r in records
    ]
