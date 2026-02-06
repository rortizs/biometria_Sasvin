"""
Geographic fraud detection services using PostGIS.

Detects suspicious attendance patterns that may indicate fraud:
- Impossible travel: Check-ins in distant locations within short time
- Location anomalies: Check-ins far from employee's typical patterns
- Multiple concurrent check-ins: Same employee in multiple places
- Device pattern anomalies: Suspicious device switching

All calculations use PostGIS for optimal performance.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings

settings = get_settings()


@dataclass
class FraudAlert:
    """Fraud detection alert."""

    alert_type: str  # "impossible_travel", "location_anomaly", "device_anomaly", etc.
    severity: str  # "low", "medium", "high", "critical"
    confidence: float  # 0-1, higher = more confident it's fraud
    details: dict  # Alert-specific details
    message: str  # Human-readable message
    recommended_action: str  # What to do about it


async def detect_impossible_travel(
    db: AsyncSession,
    employee_id: uuid.UUID,
    current_lat: float,
    current_lon: float,
    time_window_minutes: int | None = None,
) -> FraudAlert | None:
    """
    Detect impossible travel: check-in in distant location too quickly.

    Example scenarios:
    - 08:00 AM: Check-in at Location A (Guatemala City)
    - 08:15 AM: Check-in at Location B (Antigua, 45km away)
    - Required speed: 180 km/h → IMPOSSIBLE in city traffic

    Uses PostGIS ST_Distance for accurate geographic calculations.

    Args:
        db: Database session
        employee_id: Employee UUID
        current_lat: Current check-in latitude
        current_lon: Current check-in longitude
        time_window_minutes: Time window to check (default: from settings)

    Returns:
        FraudAlert if impossible travel detected, None if valid

    Example:
        >>> alert = await detect_impossible_travel(db, employee_id, 14.5555, -90.7308)
        >>> if alert and alert.severity == "high":
        >>>     # Block check-in, send notification to admin
        >>>     raise HTTPException(403, alert.message)
    """
    if time_window_minutes is None:
        time_window_minutes = settings.impossible_travel_window_minutes

    # Get last check-in within time window using PostGIS
    query = text("""
        WITH last_checkin AS (
            SELECT 
                check_in,
                check_in_point,
                record_date,
                check_in_latitude,
                check_in_longitude
            FROM attendance_records
            WHERE 
                employee_id = :employee_id
                AND check_in IS NOT NULL
                AND check_in_point IS NOT NULL
                AND check_in >= NOW() - INTERVAL ':time_window minutes'
            ORDER BY check_in DESC
            LIMIT 1
        )
        SELECT 
            lc.check_in as last_check_in_time,
            lc.check_in_latitude as last_lat,
            lc.check_in_longitude as last_lon,
            ST_Distance(
                lc.check_in_point,
                ST_SetSRID(ST_MakePoint(:current_lon, :current_lat), 4326)::geography
            ) as distance_meters,
            EXTRACT(EPOCH FROM (NOW() - lc.check_in)) / 60 as minutes_elapsed
        FROM last_checkin lc
    """)

    result = await db.execute(
        query,
        {
            "employee_id": str(employee_id),
            "current_lat": current_lat,
            "current_lon": current_lon,
            "time_window": time_window_minutes,
        },
    )
    row = result.fetchone()

    if not row:
        # No recent check-in, cannot detect impossible travel
        return None

    distance_km = row.distance_meters / 1000
    minutes_elapsed = row.minutes_elapsed

    # Prevent division by zero
    if minutes_elapsed < 1:
        minutes_elapsed = 1

    # Calculate required speed (km/h)
    required_speed_kmh = (distance_km / minutes_elapsed) * 60

    # Get max reasonable speed from settings (default: 80 km/h)
    max_reasonable_speed = settings.max_reasonable_speed_kmh

    # Calculate how much over the limit (for severity calculation)
    speed_ratio = required_speed_kmh / max_reasonable_speed

    if speed_ratio > 1.0:
        # Determine severity based on how impossible the travel is
        if speed_ratio > 3.0:  # 3x max speed
            severity = "critical"
            confidence = 0.99
            action = "Block check-in immediately, investigate account"
        elif speed_ratio > 2.0:  # 2x max speed
            severity = "high"
            confidence = 0.95
            action = "Block check-in, send alert to supervisor"
        elif speed_ratio > 1.5:  # 1.5x max speed
            severity = "medium"
            confidence = 0.85
            action = "Allow but flag for review"
        else:  # 1-1.5x max speed
            severity = "low"
            confidence = 0.70
            action = "Log for audit trail"

        return FraudAlert(
            alert_type="impossible_travel",
            severity=severity,
            confidence=confidence,
            details={
                "distance_km": round(distance_km, 2),
                "time_elapsed_minutes": round(minutes_elapsed, 1),
                "required_speed_kmh": round(required_speed_kmh, 1),
                "max_reasonable_speed_kmh": max_reasonable_speed,
                "speed_ratio": round(speed_ratio, 2),
                "last_check_in_time": row.last_check_in_time.isoformat(),
                "last_location": {"latitude": row.last_lat, "longitude": row.last_lon},
                "current_location": {"latitude": current_lat, "longitude": current_lon},
            },
            message=f"Impossible travel detected: {distance_km:.1f}km in {minutes_elapsed:.0f} minutes requires {required_speed_kmh:.0f}km/h (max reasonable: {max_reasonable_speed}km/h)",
            recommended_action=action,
        )

    return None


async def detect_location_pattern_anomaly(
    db: AsyncSession,
    employee_id: uuid.UUID,
    current_lat: float,
    current_lon: float,
    lookback_days: int | None = None,
    z_score_threshold: float | None = None,
) -> FraudAlert | None:
    """
    Detect if current location is anomalous compared to employee's historical patterns.

    Uses statistical analysis (z-score) to determine if current check-in is unusually
    far from employee's typical locations. Helpful for detecting:
    - Photo sharing: Employee always checks in at Location A, suddenly 50km away
    - Account compromise: Legitimate user's pattern changes dramatically
    - Geographic fraud: Employee traveling but using colleague's credentials

    Args:
        db: Database session
        employee_id: Employee UUID
        current_lat: Current check-in latitude
        current_lon: Current check-in longitude
        lookback_days: Days to analyze (default: from settings)
        z_score_threshold: Standard deviations threshold (default: from settings)

    Returns:
        FraudAlert if anomaly detected, None if within normal pattern

    Example:
        >>> alert = await detect_location_pattern_anomaly(db, employee_id, 14.1234, -91.5678)
        >>> if alert:
        >>>     logger.warning(f"Location anomaly: {alert.message}")
        >>>     # Require additional verification (e.g., supervisor approval)
    """
    if lookback_days is None:
        lookback_days = settings.location_anomaly_lookback_days

    if z_score_threshold is None:
        z_score_threshold = settings.location_anomaly_z_score_threshold

    # Calculate employee's typical location (centroid) and variance using PostGIS
    query = text("""
        WITH employee_checkins AS (
            SELECT check_in_point
            FROM attendance_records
            WHERE 
                employee_id = :employee_id
                AND check_in_point IS NOT NULL
                AND record_date >= CURRENT_DATE - INTERVAL ':lookback_days days'
        ),
        centroid AS (
            SELECT 
                ST_Centroid(ST_Collect(check_in_point))::geography as center_point,
                COUNT(*) as total_checkins
            FROM employee_checkins
        ),
        stats AS (
            SELECT 
                AVG(ST_Distance(ec.check_in_point, c.center_point)) as avg_distance,
                STDDEV(ST_Distance(ec.check_in_point, c.center_point)) as std_distance,
                c.total_checkins
            FROM employee_checkins ec, centroid c
            GROUP BY c.total_checkins
        )
        SELECT 
            s.avg_distance,
            s.std_distance,
            s.total_checkins,
            ST_Distance(
                c.center_point,
                ST_SetSRID(ST_MakePoint(:current_lon, :current_lat), 4326)::geography
            ) as current_distance,
            ST_Y(c.center_point::geometry) as center_lat,
            ST_X(c.center_point::geometry) as center_lon
        FROM stats s, centroid c
    """)

    result = await db.execute(
        query,
        {
            "employee_id": str(employee_id),
            "current_lat": current_lat,
            "current_lon": current_lon,
            "lookback_days": lookback_days,
        },
    )
    row = result.fetchone()

    # Require at least 5 check-ins for statistical significance
    if not row or row.total_checkins < 5:
        return None

    # Prevent division by zero
    std_distance = row.std_distance or 1.0

    # Calculate z-score: how many standard deviations from the mean
    z_score = (row.current_distance - row.avg_distance) / std_distance

    # Check if anomaly
    if z_score > z_score_threshold:
        # Determine severity based on z-score magnitude
        if z_score > z_score_threshold * 2:  # 6+ std deviations (if threshold is 3)
            severity = "critical"
            confidence = 0.98
            action = "Block check-in, require supervisor approval"
        elif z_score > z_score_threshold * 1.5:  # 4.5+ std deviations
            severity = "high"
            confidence = 0.92
            action = "Flag for manual review, send alert"
        elif z_score > z_score_threshold:  # 3+ std deviations
            severity = "medium"
            confidence = 0.85
            action = "Log anomaly, allow but monitor"
        else:
            severity = "low"
            confidence = 0.70
            action = "Log for audit trail"

        return FraudAlert(
            alert_type="location_anomaly",
            severity=severity,
            confidence=confidence,
            details={
                "z_score": round(z_score, 2),
                "z_score_threshold": z_score_threshold,
                "avg_distance_meters": round(row.avg_distance, 2),
                "std_distance_meters": round(std_distance, 2),
                "current_distance_meters": round(row.current_distance, 2),
                "total_historical_checkins": row.total_checkins,
                "lookback_days": lookback_days,
                "typical_location": {
                    "latitude": row.center_lat,
                    "longitude": row.center_lon,
                },
                "current_location": {"latitude": current_lat, "longitude": current_lon},
            },
            message=f"Location anomaly: {z_score:.1f} standard deviations from normal pattern ({z_score_threshold} threshold)",
            recommended_action=action,
        )

    return None


async def detect_concurrent_checkins(
    db: AsyncSession, employee_id: uuid.UUID, time_window_minutes: int = 5
) -> FraudAlert | None:
    """
    Detect if employee has multiple active check-ins (impossible to be in 2 places).

    Example:
    - Employee has active check-in at Location A (no check-out yet)
    - Attempts new check-in at Location B within 5 minutes
    - Physically impossible unless using multiple devices/accounts

    Args:
        db: Database session
        employee_id: Employee UUID
        time_window_minutes: Time window to check (default: 5 minutes)

    Returns:
        FraudAlert if concurrent check-ins detected
    """
    query = text("""
        SELECT 
            id,
            record_date,
            check_in,
            check_out,
            ST_Y(check_in_point::geometry) as lat,
            ST_X(check_in_point::geometry) as lon,
            check_in_distance_meters,
            check_in_device_fingerprint
        FROM attendance_records
        WHERE 
            employee_id = :employee_id
            AND check_in IS NOT NULL
            AND check_out IS NULL  -- Still active (no check-out)
            AND check_in >= NOW() - INTERVAL ':time_window minutes'
        ORDER BY check_in DESC
    """)

    result = await db.execute(
        query, {"employee_id": str(employee_id), "time_window": time_window_minutes}
    )

    active_checkins = result.fetchall()

    if len(active_checkins) > 1:
        return FraudAlert(
            alert_type="concurrent_checkins",
            severity="critical",
            confidence=0.99,
            details={
                "total_active_checkins": len(active_checkins),
                "time_window_minutes": time_window_minutes,
                "locations": [
                    {
                        "record_id": str(row.id),
                        "check_in_time": row.check_in.isoformat(),
                        "latitude": row.lat,
                        "longitude": row.lon,
                        "device_fingerprint": row.check_in_device_fingerprint,
                    }
                    for row in active_checkins
                ],
            },
            message=f"Multiple concurrent check-ins detected: {len(active_checkins)} active sessions",
            recommended_action="Block check-in, investigate account for credential sharing",
        )

    return None


async def detect_device_pattern_anomaly(
    db: AsyncSession,
    employee_id: uuid.UUID,
    current_device_fingerprint: str,
    lookback_days: int = 7,
) -> FraudAlert | None:
    """
    Detect suspicious device switching patterns.

    Warning signs:
    - Employee suddenly uses many different devices
    - Device switches every check-in (possible credential sharing)
    - Device never seen before after long period of single device use

    Args:
        db: Database session
        employee_id: Employee UUID
        current_device_fingerprint: Current device fingerprint (SHA256 hash)
        lookback_days: Days to analyze (default: 7)

    Returns:
        FraudAlert if suspicious device pattern detected
    """
    query = text("""
        WITH device_stats AS (
            SELECT 
                COUNT(DISTINCT check_in_device_fingerprint) as unique_devices,
                COUNT(*) as total_checkins,
                MODE() WITHIN GROUP (ORDER BY check_in_device_fingerprint) as most_common_device
            FROM attendance_records
            WHERE 
                employee_id = :employee_id
                AND check_in_device_fingerprint IS NOT NULL
                AND record_date >= CURRENT_DATE - INTERVAL ':lookback_days days'
        )
        SELECT 
            unique_devices,
            total_checkins,
            most_common_device,
            :current_device IN (
                SELECT DISTINCT check_in_device_fingerprint 
                FROM attendance_records 
                WHERE employee_id = :employee_id 
                AND check_in_device_fingerprint IS NOT NULL
                AND record_date >= CURRENT_DATE - INTERVAL ':lookback_days days'
            ) as device_known
        FROM device_stats
    """)

    result = await db.execute(
        query,
        {
            "employee_id": str(employee_id),
            "current_device": current_device_fingerprint,
            "lookback_days": lookback_days,
        },
    )
    row = result.fetchone()

    if not row or row.total_checkins < 3:
        # Insufficient data
        return None

    # Red flags:
    # 1. Too many unique devices (> 3 in a week is suspicious)
    # 2. New device never seen before
    # 3. Device switches every time (unique_devices == total_checkins)

    if row.unique_devices > 3:
        severity = "high" if row.unique_devices > 5 else "medium"
        return FraudAlert(
            alert_type="device_anomaly",
            severity=severity,
            confidence=0.80,
            details={
                "unique_devices_count": row.unique_devices,
                "total_checkins": row.total_checkins,
                "lookback_days": lookback_days,
                "current_device_known": row.device_known,
                "most_common_device": row.most_common_device,
            },
            message=f"Suspicious device pattern: {row.unique_devices} different devices in {lookback_days} days",
            recommended_action="Monitor closely, possible credential sharing",
        )

    if not row.device_known and row.total_checkins > 10:
        # New device after many check-ins from single device
        return FraudAlert(
            alert_type="device_anomaly",
            severity="medium",
            confidence=0.75,
            details={
                "unique_devices_count": row.unique_devices,
                "total_checkins": row.total_checkins,
                "current_device_known": False,
                "most_common_device": row.most_common_device,
            },
            message="New device detected after consistent single-device usage",
            recommended_action="Verify employee identity, possible account compromise",
        )

    return None
