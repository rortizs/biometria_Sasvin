from datetime import datetime, date
from uuid import UUID

from pydantic import BaseModel, Field


class AttendanceCheckIn(BaseModel):
    image: str  # Base64 encoded image
    device_id: UUID | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class AttendanceCheckOut(BaseModel):
    image: str  # Base64 encoded image
    device_id: UUID | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class AttendanceResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: str
    record_date: date
    check_in: datetime | None = None
    check_out: datetime | None = None
    status: str
    confidence: float | None = None
    message: str | None = None
    geo_validated: bool = False
    distance_meters: float | None = None

    class Config:
        from_attributes = True


class AttendanceRecordResponse(BaseModel):
    """Full attendance record response."""
    id: UUID
    employee_id: UUID
    record_date: date
    check_in: datetime | None = None
    check_out: datetime | None = None
    check_in_confidence: float | None = None
    check_out_confidence: float | None = None
    status: str
    notes: str | None = None
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
