from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.models.permission_request import PermissionRequestStatus, RejectionStage


class PermissionRequestCreate(BaseModel):
    employee_id: UUID
    exception_type: str
    start_date: date
    end_date: date
    description: str | None = None

    @field_validator("start_date")
    @classmethod
    def validate_min_advance(cls, v: date) -> date:
        from datetime import date as date_type
        today = date_type.today()
        delta = (v - today).days
        if delta < 7:
            raise ValueError("La solicitud debe realizarse con al menos 7 días de anticipación")
        return v


class PermissionRequestApprove(BaseModel):
    notes: str | None = None


class PermissionRequestReject(BaseModel):
    rejection_reason: str  # required


class PermissionRequestResponse(BaseModel):
    id: UUID
    requested_by_user_id: UUID
    employee_id: UUID
    exception_type: str
    start_date: date
    end_date: date
    description: str | None
    status: PermissionRequestStatus
    coordinator_reviewed_by: UUID | None
    coordinator_reviewed_at: datetime | None
    coordinator_notes: str | None
    director_reviewed_by: UUID | None
    director_reviewed_at: datetime | None
    director_notes: str | None
    rejection_stage: RejectionStage | None
    rejection_reason: str | None
    schedule_exception_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
