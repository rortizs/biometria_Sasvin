from datetime import datetime, date
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class AttendanceCheckIn(BaseModel):
    images: list[str] = Field(..., min_length=1, max_length=5)  # Base64 encoded images
    image: str | None = None  # DEPRECATED: backward compat alias
    device_id: UUID | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="before")
    @classmethod
    def handle_single_image(cls, data: dict) -> dict:
        """Backward compat: if 'image' provided but not 'images', wrap it."""
        if isinstance(data, dict):
            if "image" in data and "images" not in data:
                data["images"] = [data["image"]]
        return data


class AttendanceCheckOut(BaseModel):
    images: list[str] = Field(..., min_length=1, max_length=5)  # Base64 encoded images
    image: str | None = None  # DEPRECATED: backward compat alias
    device_id: UUID | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="before")
    @classmethod
    def handle_single_image(cls, data: dict) -> dict:
        """Backward compat: if 'image' provided but not 'images', wrap it."""
        if isinstance(data, dict):
            if "image" in data and "images" not in data:
                data["images"] = [data["image"]]
        return data


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
