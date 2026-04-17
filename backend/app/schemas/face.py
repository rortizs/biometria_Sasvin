from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

_BASE64_IMAGE_EXAMPLE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBg..."


class StageMetrics(BaseModel):
    prep: datetime
    capture: datetime
    review: datetime

    model_config = ConfigDict(extra="allow")


class FaceRegisterRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "employee_id": "550e8400-e29b-41d4-a716-446655440000",
                "images": [
                    _BASE64_IMAGE_EXAMPLE,
                    _BASE64_IMAGE_EXAMPLE,
                ],
            }
        }
    )

    employee_id: UUID = Field(
        ...,
        description="UUID del empleado. Obtenerlo desde GET /api/v1/employees/.",
    )
    images: list[str] = Field(
        ...,
        description=(
            "1 a 5 fotos del empleado en base64 (data URL o base64 puro). "
            "Usar fotos con distintos ángulos y luminosidad para mejor precisión del embedding."
        ),
    )
    session_id: str | None = None
    stage_metrics: StageMetrics | None = None
    capture_origin: str | None = None


class FaceVerifyRequest(BaseModel):
    image: str  # Base64 encoded image
    device_id: UUID | None = None


class FaceVerifyResponse(BaseModel):
    success: bool
    employee_id: UUID | None = None
    employee_name: str | None = None
    confidence: float | None = None
    message: str | None = None
