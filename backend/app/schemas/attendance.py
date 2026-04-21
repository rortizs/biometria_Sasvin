from datetime import datetime, date, timezone
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator


def _as_utc(dt: datetime | None) -> str | None:
    """Serialize naive datetime as UTC ISO 8601 with +00:00 offset."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

_BASE64_IMAGE_EXAMPLE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBg..."


class AttendanceCheckIn(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "images": [_BASE64_IMAGE_EXAMPLE],
                "latitude": 14.6407,
                "longitude": -90.5133,
            }
        }
    )

    images: list[str] = Field(
        ...,
        min_length=1,
        max_length=5,
        description=(
            "1 a 5 fotos del rostro en formato base64 (data URL o base64 puro). "
            "Se recomienda 3 fotos con 250 ms de diferencia entre capturas."
        ),
    )
    image: str | None = None  # DEPRECATED: backward compat alias
    device_id: UUID | None = None
    latitude: float | None = Field(
        default=None,
        ge=-90,
        le=90,
        description="Latitud GPS del dispositivo. Opcional — no bloquea el registro si se omite.",
    )
    longitude: float | None = Field(
        default=None,
        ge=-180,
        le=180,
        description="Longitud GPS del dispositivo. Opcional — no bloquea el registro si se omite.",
    )

    @model_validator(mode="before")
    @classmethod
    def handle_single_image(cls, data: dict) -> dict:
        """Backward compat: if 'image' provided but not 'images', wrap it."""
        if isinstance(data, dict):
            if "image" in data and "images" not in data:
                data["images"] = [data["image"]]
        return data


class AttendanceCheckOut(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "images": [_BASE64_IMAGE_EXAMPLE],
                "latitude": 14.6407,
                "longitude": -90.5133,
            }
        }
    )

    images: list[str] = Field(
        ...,
        min_length=1,
        max_length=5,
        description=(
            "1 a 5 fotos del rostro en formato base64 (data URL o base64 puro). "
            "Se recomienda 3 fotos con 250 ms de diferencia entre capturas."
        ),
    )
    image: str | None = None  # DEPRECATED: backward compat alias
    device_id: UUID | None = None
    latitude: float | None = Field(
        default=None,
        ge=-90,
        le=90,
        description="Latitud GPS del dispositivo. Opcional — no bloquea el registro si se omite.",
    )
    longitude: float | None = Field(
        default=None,
        ge=-180,
        le=180,
        description="Longitud GPS del dispositivo. Opcional — no bloquea el registro si se omite.",
    )

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

    model_config = ConfigDict(from_attributes=True)

    @field_serializer('check_in', 'check_out')
    def serialize_datetime(self, dt: datetime | None) -> str | None:
        return _as_utc(dt)


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

    model_config = ConfigDict(from_attributes=True)

    @field_serializer('check_in', 'check_out', 'created_at')
    def serialize_datetime(self, dt: datetime | None) -> str | None:
        return _as_utc(dt)
