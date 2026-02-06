from datetime import datetime, date
from uuid import UUID

from pydantic import BaseModel, Field


class AttendanceCheckIn(BaseModel):
    """Check-in request with anti-spoofing support."""

    # Anti-spoofing: Multiple frames for liveness detection
    # Single image is still supported for backward compatibility
    image: str | None = None  # DEPRECATED: Use images instead (backward compatibility)
    images: list[str] = Field(
        default_factory=list, min_length=0, max_length=5
    )  # 3-5 frames recommended

    device_id: UUID | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    def get_frames(self) -> list[str]:
        """Get frames for processing (handles backward compatibility)."""
        if self.images:
            return self.images
        elif self.image:
            return [self.image]
        return []


class AttendanceCheckOut(BaseModel):
    """Check-out request with anti-spoofing support."""

    # Anti-spoofing: Multiple frames for liveness detection
    image: str | None = None  # DEPRECATED: Use images instead (backward compatibility)
    images: list[str] = Field(default_factory=list, min_length=0, max_length=5)

    device_id: UUID | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    def get_frames(self) -> list[str]:
        """Get frames for processing (handles backward compatibility)."""
        if self.images:
            return self.images
        elif self.image:
            return [self.image]
        return []


class AttendanceResponse(BaseModel):
    """Quick attendance response (for check-in/check-out endpoints)."""

    id: UUID
    employee_id: UUID
    employee_name: str
    record_date: date
    check_in: datetime | None = None
    check_out: datetime | None = None
    status: str

    # Face recognition confidence (0-1)
    confidence: float | None = None

    # Anti-spoofing: Liveness detection score (0-1, higher = more confident it's real)
    liveness_score: float | None = None

    # Geolocation
    message: str | None = None
    geo_validated: bool = False
    distance_meters: float | None = None

    class Config:
        from_attributes = True


class AttendanceRecordResponse(BaseModel):
    """Full attendance record response (for analytics/reports)."""

    id: UUID
    employee_id: UUID
    record_date: date
    check_in: datetime | None = None
    check_out: datetime | None = None

    # Face recognition scores
    check_in_confidence: float | None = None
    check_out_confidence: float | None = None

    # Anti-spoofing: Liveness detection scores
    check_in_liveness_score: float | None = None
    check_out_liveness_score: float | None = None

    # Anti-spoofing: Device fingerprints (for fraud detection)
    check_in_device_fingerprint: str | None = None
    check_out_device_fingerprint: str | None = None

    status: str
    notes: str | None = None

    # Legacy geolocation (for backward compatibility)
    check_in_latitude: float | None = None
    check_in_longitude: float | None = None
    check_in_distance_meters: float | None = None
    check_out_latitude: float | None = None
    check_out_longitude: float | None = None
    check_out_distance_meters: float | None = None
    geo_validated: bool = False

    created_at: datetime

    class Config:
        from_attributes = True
