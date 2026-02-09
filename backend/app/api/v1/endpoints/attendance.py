"""
Attendance endpoints with complete anti-fraud stack:

1. Liveness Detection (anti-spoofing)
2. Face Recognition with validations
3. PostGIS Geolocation validation
4. Fraud Detection (impossible travel, concurrent check-ins, device anomalies)
5. Device Fingerprinting
"""

from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_active_admin
from app.core.config import get_settings
from app.models.attendance import AttendanceRecord
from app.models.employee import Employee
from app.models.location import Location
from app.models.user import User
from app.schemas.attendance import (
    AttendanceCheckIn,
    AttendanceCheckOut,
    AttendanceResponse,
)
from app.services.anti_spoofing import AntiSpoofingService
from app.services.face_recognition import FaceRecognitionService
from app.services.geolocation_postgis import (
    validate_location_postgis,
    find_nearest_location,
)
from app.services.fraud_detection import (
    detect_impossible_travel,
    detect_concurrent_checkins,
    detect_location_pattern_anomaly,
    detect_device_pattern_anomaly,
)

router = APIRouter()
settings = get_settings()


async def _validate_liveness(
    frames: list[str], anti_spoofing_service: AntiSpoofingService
) -> tuple[bool, float, str | None, int]:
    """
    Validate liveness using anti-spoofing service.

    Returns: (is_real, liveness_score, error_message, best_frame_index)
    """
    if not settings.liveness_detection_enabled:
        # Liveness detection disabled - return neutral values
        return True, 0.5, None, 0

    if len(frames) < settings.liveness_min_frames:
        return (
            False,
            0.0,
            f"Need at least {settings.liveness_min_frames} frames for liveness detection, got {len(frames)}",
            -1,
        )

    # Run liveness detection
    result = await anti_spoofing_service.verify_liveness(frames)

    if result.error_message:
        return False, result.avg_score, result.error_message, result.best_frame_index

    return (
        result.is_real,
        result.avg_score,
        None
        if result.is_real
        else "Liveness check failed - possible spoofing detected",
        result.best_frame_index,
    )


def _generate_device_fingerprint(device_id: UUID | None) -> str | None:
    """
    Generate device fingerprint for fraud detection.

    In production, this should include more device metadata (OS, browser, etc.)
    For now, we use the device_id as fingerprint.
    """
    if device_id is None:
        return None
    return str(device_id)


async def _run_fraud_detection(
    db: AsyncSession,
    employee: Employee,
    latitude: float | None,
    longitude: float | None,
    device_fingerprint: str | None,
    is_check_in: bool,
) -> list[str]:
    """
    Run fraud detection checks and return list of warnings.
    """
    warnings = []

    # Check 1: Impossible travel
    if latitude and longitude:
        impossible_travel = await detect_impossible_travel(
            db=db,
            employee_id=employee.id,
            current_lat=latitude,
            current_lon=longitude,
            max_speed_kmh=settings.max_reasonable_speed_kmh,
            window_minutes=settings.impossible_travel_window_minutes,
        )
        if impossible_travel.is_suspicious:
            warnings.append(
                f"⚠️ Impossible travel detected: {impossible_travel.distance_km:.1f}km in "
                f"{impossible_travel.time_minutes:.0f} min "
                f"(requires {impossible_travel.required_speed_kmh:.0f}km/h)"
            )

    # Check 2: Concurrent check-ins (only for check-in)
    if is_check_in:
        concurrent = await detect_concurrent_checkins(db, employee.id)
        if concurrent.has_active_checkin:
            warnings.append(
                f"⚠️ Already checked in at {concurrent.active_checkin_location} "
                f"at {concurrent.active_checkin_time.strftime('%H:%M')}"
            )

    # Check 3: Location pattern anomaly
    if latitude and longitude:
        location_anomaly = await detect_location_pattern_anomaly(
            db=db,
            employee_id=employee.id,
            current_lat=latitude,
            current_lon=longitude,
            lookback_days=settings.location_anomaly_lookback_days,
            z_score_threshold=settings.location_anomaly_z_score_threshold,
        )
        if location_anomaly.is_anomaly:
            warnings.append(
                f"⚠️ Unusual location: {location_anomaly.distance_from_typical:.0f}m from typical location "
                f"(z-score: {location_anomaly.z_score:.1f})"
            )

    # Check 4: Device pattern anomaly
    if device_fingerprint:
        device_anomaly = await detect_device_pattern_anomaly(
            db=db,
            employee_id=employee.id,
            current_fingerprint=device_fingerprint,
            lookback_days=30,
        )
        if device_anomaly.is_suspicious:
            warnings.append(
                f"⚠️ New/unusual device detected "
                f"(last seen: {device_anomaly.last_seen_days} days ago)"
            )

    return warnings


@router.post("/check-in", response_model=AttendanceResponse)
async def check_in(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: AttendanceCheckIn,
) -> AttendanceResponse:
    """
    Check-in with complete anti-fraud validation:

    1. Liveness Detection (3-5 frames) - prevents photo/video spoofing
    2. Face Recognition with validations - identifies employee
    3. PostGIS Geolocation - validates location
    4. Fraud Detection - detects suspicious patterns
    """
    # Get frames for processing
    frames = request.get_frames()

    if not frames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No images provided. Please provide 3-5 frames for liveness detection.",
        )

    # Initialize services
    anti_spoofing = AntiSpoofingService()
    face_service = FaceRecognitionService()

    # Step 1: Liveness Detection (Anti-Spoofing)
    is_real, liveness_score, liveness_error, best_frame_idx = await _validate_liveness(
        frames, anti_spoofing
    )

    if not is_real:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=liveness_error or "Liveness check failed - please use a real face",
        )

    # Step 2: Face Recognition (use best frame from liveness detection)
    best_frame = frames[best_frame_idx] if best_frame_idx >= 0 else frames[0]

    face_result = face_service.get_face_embedding_with_validation(best_frame)

    if not face_result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=face_result.error_message or "Face detection failed",
        )

    # Find matching employee
    match = await face_service.find_best_match(db, face_result.embedding)

    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No matching employee found. Please ensure your face is registered.",
        )

    employee, confidence = match
    today = date.today()
    now = datetime.utcnow()

    # Step 3: PostGIS Geolocation Validation
    geo_valid = False
    distance = None
    geo_point = None

    if request.latitude is not None and request.longitude is not None:
        # Create PostGIS point
        geo_point = from_shape(Point(request.longitude, request.latitude), srid=4326)

        # Validate location using PostGIS
        validation = await validate_location_postgis(
            db=db,
            employee_id=employee.id,
            user_point=geo_point,
        )

        if validation:
            geo_valid = validation.is_valid
            distance = validation.distance_meters

    # Step 4: Fraud Detection
    device_fingerprint = _generate_device_fingerprint(request.device_id)
    fraud_warnings = await _run_fraud_detection(
        db=db,
        employee=employee,
        latitude=request.latitude,
        longitude=request.longitude,
        device_fingerprint=device_fingerprint,
        is_check_in=True,
    )

    # Check if already checked in today
    result = await db.execute(
        select(AttendanceRecord).where(
            and_(
                AttendanceRecord.employee_id == employee.id,
                AttendanceRecord.record_date == today,
            )
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
                liveness_score=liveness_score,
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

    # Save check-in data
    attendance.check_in = now
    attendance.check_in_confidence = confidence
    attendance.check_in_liveness_score = liveness_score
    attendance.check_in_device_fingerprint = device_fingerprint
    attendance.status = "present"

    # Store PostGIS point
    if geo_point is not None:
        attendance.check_in_point = geo_point

    # Legacy geolocation fields (for backward compatibility)
    attendance.check_in_latitude = request.latitude
    attendance.check_in_longitude = request.longitude
    attendance.check_in_distance_meters = distance
    attendance.geo_validated = geo_valid

    await db.commit()
    await db.refresh(attendance)

    # Build message
    message_parts = [
        f"✅ Welcome, {employee.full_name}! Check-in at {now.strftime('%H:%M')}"
    ]
    message_parts.append(f"🎯 Confidence: {confidence:.1%}")
    message_parts.append(f"👤 Liveness: {liveness_score:.1%}")

    if not geo_valid and request.latitude is not None:
        if distance:
            message_parts.append(f"📍 Outside area: {distance:.0f}m")
        else:
            message_parts.append("📍 No location assigned")

    # Add fraud warnings
    if fraud_warnings:
        message_parts.extend(fraud_warnings)

    message = " | ".join(message_parts)

    return AttendanceResponse(
        id=attendance.id,
        employee_id=employee.id,
        employee_name=employee.full_name,
        record_date=today,
        check_in=attendance.check_in,
        check_out=attendance.check_out,
        status=attendance.status,
        confidence=confidence,
        liveness_score=liveness_score,
        geo_validated=geo_valid,
        distance_meters=distance,
        message=message,
    )


@router.post("/check-out", response_model=AttendanceResponse)
async def check_out(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: AttendanceCheckOut,
) -> AttendanceResponse:
    """
    Check-out with complete anti-fraud validation.
    """
    # Get frames for processing
    frames = request.get_frames()

    if not frames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No images provided. Please provide 3-5 frames for liveness detection.",
        )

    # Initialize services
    anti_spoofing = AntiSpoofingService()
    face_service = FaceRecognitionService()

    # Step 1: Liveness Detection
    is_real, liveness_score, liveness_error, best_frame_idx = await _validate_liveness(
        frames, anti_spoofing
    )

    if not is_real:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=liveness_error or "Liveness check failed - please use a real face",
        )

    # Step 2: Face Recognition
    best_frame = frames[best_frame_idx] if best_frame_idx >= 0 else frames[0]
    face_result = face_service.get_face_embedding_with_validation(best_frame)

    if not face_result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=face_result.error_message or "Face detection failed",
        )

    match = await face_service.find_best_match(db, face_result.embedding)

    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No matching employee found",
        )

    employee, confidence = match
    today = date.today()
    now = datetime.utcnow()

    # Step 3: PostGIS Geolocation
    geo_valid = False
    distance = None
    geo_point = None

    if request.latitude is not None and request.longitude is not None:
        geo_point = from_shape(Point(request.longitude, request.latitude), srid=4326)

        validation = await validate_location_postgis(
            db=db,
            employee_id=employee.id,
            user_point=geo_point,
        )

        if validation:
            geo_valid = validation.is_valid
            distance = validation.distance_meters

    # Step 4: Fraud Detection
    device_fingerprint = _generate_device_fingerprint(request.device_id)
    fraud_warnings = await _run_fraud_detection(
        db=db,
        employee=employee,
        latitude=request.latitude,
        longitude=request.longitude,
        device_fingerprint=device_fingerprint,
        is_check_in=False,
    )

    # Get today's record
    result = await db.execute(
        select(AttendanceRecord).where(
            and_(
                AttendanceRecord.employee_id == employee.id,
                AttendanceRecord.record_date == today,
            )
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
            liveness_score=liveness_score,
            geo_validated=attendance.geo_validated,
            distance_meters=attendance.check_out_distance_meters,
            message=f"Already checked out at {attendance.check_out.strftime('%H:%M')}",
        )

    # Save check-out data
    attendance.check_out = now
    attendance.check_out_confidence = confidence
    attendance.check_out_liveness_score = liveness_score
    attendance.check_out_device_fingerprint = device_fingerprint

    # Store PostGIS point
    if geo_point is not None:
        attendance.check_out_point = geo_point

    # Legacy geolocation fields
    attendance.check_out_latitude = request.latitude
    attendance.check_out_longitude = request.longitude
    attendance.check_out_distance_meters = distance

    # Update geo_validated: only true if both check-in and check-out were validated
    if attendance.geo_validated and not geo_valid:
        attendance.geo_validated = False

    await db.commit()
    await db.refresh(attendance)

    # Build message
    message_parts = [
        f"✅ Goodbye, {employee.full_name}! Check-out at {now.strftime('%H:%M')}"
    ]
    message_parts.append(f"🎯 Confidence: {confidence:.1%}")
    message_parts.append(f"👤 Liveness: {liveness_score:.1%}")

    if not geo_valid and request.latitude is not None:
        if distance:
            message_parts.append(f"📍 Outside area: {distance:.0f}m")
        else:
            message_parts.append("📍 No location assigned")

    # Add fraud warnings
    if fraud_warnings:
        message_parts.extend(fraud_warnings)

    message = " | ".join(message_parts)

    return AttendanceResponse(
        id=attendance.id,
        employee_id=employee.id,
        employee_name=employee.full_name,
        record_date=today,
        check_in=attendance.check_in,
        check_out=attendance.check_out,
        status=attendance.status,
        confidence=confidence,
        liveness_score=liveness_score,
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
    """List attendance records with filters."""
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
            liveness_score=r.check_in_liveness_score,
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
    """List today's attendance records."""
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
            liveness_score=r.check_in_liveness_score,
            geo_validated=r.geo_validated,
            distance_meters=r.check_in_distance_meters,
        )
        for r in records
    ]
