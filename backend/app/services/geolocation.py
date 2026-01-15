import math
from dataclasses import dataclass


@dataclass
class GeoValidationResult:
    """Result of geolocation validation."""
    is_valid: bool
    distance_meters: float
    location_name: str | None = None
    allowed_radius: int | None = None


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the distance in meters between two GPS coordinates using the Haversine formula.

    Args:
        lat1: Latitude of first point (degrees)
        lon1: Longitude of first point (degrees)
        lat2: Latitude of second point (degrees)
        lon2: Longitude of second point (degrees)

    Returns:
        Distance in meters between the two points
    """
    R = 6371000  # Earth's radius in meters

    # Convert degrees to radians
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    # Haversine formula
    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def validate_location(
    user_lat: float,
    user_lon: float,
    location_lat: float,
    location_lon: float,
    radius_meters: int,
    location_name: str | None = None,
) -> GeoValidationResult:
    """
    Validate if user is within the allowed radius of a location.

    Args:
        user_lat: User's current latitude
        user_lon: User's current longitude
        location_lat: Location's latitude (sede)
        location_lon: Location's longitude (sede)
        radius_meters: Allowed radius in meters
        location_name: Optional name of the location for the result

    Returns:
        GeoValidationResult with validation status and distance
    """
    distance = haversine_distance(user_lat, user_lon, location_lat, location_lon)

    return GeoValidationResult(
        is_valid=distance <= radius_meters,
        distance_meters=round(distance, 2),
        location_name=location_name,
        allowed_radius=radius_meters,
    )
