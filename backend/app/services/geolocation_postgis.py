"""
PostGIS-based geolocation services for attendance validation and fraud detection.

Uses PostgreSQL's PostGIS extension for efficient spatial queries with GIST indexes.
Replaces legacy Haversine calculations with native database operations.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.location import Location
from app.models.employee import Employee


@dataclass
class GeoValidationResult:
    """Result of geolocation validation."""

    is_valid: bool
    distance_meters: float
    location_name: str | None = None
    allowed_radius: int | None = None
    nearest_location_id: uuid.UUID | None = None


async def validate_location_postgis(
    db: AsyncSession,
    user_lat: float,
    user_lon: float,
    location_id: uuid.UUID,
) -> GeoValidationResult:
    """
    Validate if user is within allowed radius of location using PostGIS.

    Uses PostgreSQL's ST_Distance function with GIST index for O(log n) performance.
    Much faster than Python-based Haversine calculations, especially with large datasets.

    Args:
        db: Database session
        user_lat: User's current latitude (WGS84)
        user_lon: User's current longitude (WGS84)
        location_id: Location UUID to validate against

    Returns:
        GeoValidationResult with validation status and calculated distance

    Example:
        >>> result = await validate_location_postgis(db, 14.6349, -90.5069, location_id)
        >>> if result.is_valid:
        >>>     print(f"Within {result.allowed_radius}m radius")
        >>> else:
        >>>     print(f"Too far: {result.distance_meters}m away")
    """
    # PostGIS query with ST_Distance (uses GIST index for performance)
    # ST_Distance returns meters when using GEOGRAPHY type
    query = text("""
        SELECT 
            l.id,
            l.name,
            l.radius_meters,
            ST_Distance(
                l.location_point,
                ST_SetSRID(ST_MakePoint(:user_lon, :user_lat), 4326)::geography
            ) as distance_meters,
            ST_DWithin(
                l.location_point,
                ST_SetSRID(ST_MakePoint(:user_lon, :user_lat), 4326)::geography,
                l.radius_meters
            ) as is_within_radius
        FROM locations l
        WHERE l.id = :location_id AND l.is_active = true
    """)

    result = await db.execute(
        query,
        {"user_lat": user_lat, "user_lon": user_lon, "location_id": str(location_id)},
    )
    row = result.fetchone()

    if not row:
        # Location not found or inactive
        return GeoValidationResult(
            is_valid=False,
            distance_meters=0.0,
            location_name=None,
            allowed_radius=None,
            nearest_location_id=None,
        )

    return GeoValidationResult(
        is_valid=row.is_within_radius,
        distance_meters=round(row.distance_meters, 2),
        location_name=row.name,
        allowed_radius=row.radius_meters,
        nearest_location_id=row.id,
    )


async def find_nearest_location(
    db: AsyncSession, user_lat: float, user_lon: float, max_distance_meters: int = 5000
) -> tuple[Location, float] | None:
    """
    Find the nearest active location to user's position.

    Useful for:
    - Suggesting location when employee has no location_id assigned
    - Detecting check-ins at wrong locations (employee assigned to Sede A but near Sede B)
    - Analytics: "Show employees currently near this location"

    Uses PostGIS ST_DWithin for initial filter (indexed) then ST_Distance for ordering.
    This is much faster than calculating distance to all locations.

    Args:
        db: Database session
        user_lat: User's current latitude (WGS84)
        user_lon: User's current longitude (WGS84)
        max_distance_meters: Maximum search radius (default: 5000m = 5km)

    Returns:
        Tuple of (Location, distance_meters) or None if no location within range

    Example:
        >>> nearest = await find_nearest_location(db, 14.6349, -90.5069, max_distance_meters=1000)
        >>> if nearest:
        >>>     location, distance = nearest
        >>>     print(f"Nearest: {location.name} ({distance}m away)")
    """
    # PostGIS query: ST_DWithin for initial filter (uses GIST index)
    # then ST_Distance for precise distance calculation
    query = text("""
        SELECT 
            l.id,
            ST_Distance(
                l.location_point,
                ST_SetSRID(ST_MakePoint(:user_lon, :user_lat), 4326)::geography
            ) as distance_meters
        FROM locations l
        WHERE 
            l.is_active = true
            AND ST_DWithin(
                l.location_point,
                ST_SetSRID(ST_MakePoint(:user_lon, :user_lat), 4326)::geography,
                :max_distance
            )
        ORDER BY distance_meters ASC
        LIMIT 1
    """)

    result = await db.execute(
        query,
        {
            "user_lat": user_lat,
            "user_lon": user_lon,
            "max_distance": max_distance_meters,
        },
    )
    row = result.fetchone()

    if not row:
        return None

    # Fetch full Location entity
    location_result = await db.execute(select(Location).where(Location.id == row.id))
    location = location_result.scalar_one_or_none()

    if not location:
        return None

    return (location, round(row.distance_meters, 2))


async def get_employee_typical_location(
    db: AsyncSession, employee_id: uuid.UUID, lookback_days: int = 30
) -> tuple[float, float] | None:
    """
    Calculate employee's typical check-in location (centroid of recent check-ins).

    Useful for detecting location anomalies: if employee always checks in near
    Location A but today checks in 50km away, that's suspicious.

    Args:
        db: Database session
        employee_id: Employee UUID
        lookback_days: Days to analyze (default: 30)

    Returns:
        Tuple of (latitude, longitude) representing typical location, or None if insufficient data

    Example:
        >>> typical = await get_employee_typical_location(db, employee_id)
        >>> if typical:
        >>>     lat, lon = typical
        >>>     # Compare current location to typical location
    """
    query = text("""
        SELECT 
            ST_Y(ST_Centroid(ST_Collect(check_in_point))::geometry) as avg_lat,
            ST_X(ST_Centroid(ST_Collect(check_in_point))::geometry) as avg_lon,
            COUNT(*) as total_checkins
        FROM attendance_records
        WHERE 
            employee_id = :employee_id
            AND check_in_point IS NOT NULL
            AND record_date >= CURRENT_DATE - INTERVAL ':lookback_days days'
    """)

    result = await db.execute(
        query, {"employee_id": str(employee_id), "lookback_days": lookback_days}
    )
    row = result.fetchone()

    # Require at least 5 check-ins for statistical significance
    if not row or row.total_checkins < 5:
        return None

    return (row.avg_lat, row.avg_lon)


async def get_locations_within_radius(
    db: AsyncSession, center_lat: float, center_lon: float, radius_meters: int
) -> list[tuple[Location, float]]:
    """
    Find all locations within specified radius of a point.

    Useful for:
    - Admin UI: "Show all locations within 10km of this address"
    - Multi-location employees: "Employee can check-in at any location within 5km of home"
    - Fraud detection: "Are there multiple locations suspiciously close to each other?"

    Args:
        db: Database session
        center_lat: Center point latitude
        center_lon: Center point longitude
        radius_meters: Search radius in meters

    Returns:
        List of (Location, distance_meters) tuples, ordered by distance
    """
    query = text("""
        SELECT 
            l.id,
            ST_Distance(
                l.location_point,
                ST_SetSRID(ST_MakePoint(:center_lon, :center_lat), 4326)::geography
            ) as distance_meters
        FROM locations l
        WHERE 
            l.is_active = true
            AND ST_DWithin(
                l.location_point,
                ST_SetSRID(ST_MakePoint(:center_lon, :center_lat), 4326)::geography,
                :radius
            )
        ORDER BY distance_meters ASC
    """)

    result = await db.execute(
        query,
        {"center_lat": center_lat, "center_lon": center_lon, "radius": radius_meters},
    )
    rows = result.fetchall()

    if not rows:
        return []

    # Fetch all Location entities
    location_ids = [row.id for row in rows]
    locations_result = await db.execute(
        select(Location).where(Location.id.in_(location_ids))
    )
    locations_map = {loc.id: loc for loc in locations_result.scalars().all()}

    # Combine with distances, maintaining order
    return [
        (locations_map[row.id], round(row.distance_meters, 2))
        for row in rows
        if row.id in locations_map
    ]
