from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class StageMetrics(BaseModel):
    prep: datetime
    capture: datetime
    review: datetime

    model_config = ConfigDict(extra="allow")


class FaceRegisterRequest(BaseModel):
    employee_id: UUID
    images: list[str]  # List of base64 encoded images
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
