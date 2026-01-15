from uuid import UUID

from pydantic import BaseModel


class FaceRegisterRequest(BaseModel):
    employee_id: UUID
    images: list[str]  # List of base64 encoded images


class FaceVerifyRequest(BaseModel):
    image: str  # Base64 encoded image
    device_id: UUID | None = None


class FaceVerifyResponse(BaseModel):
    success: bool
    employee_id: UUID | None = None
    employee_name: str | None = None
    confidence: float | None = None
    message: str | None = None
