from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, field_validator, model_validator

from app.models.permission_request import PermissionRequestStatus, RejectionStage


class PermissionRequestCreate(BaseModel):
    employee_id: UUID
    exception_type: str
    start_date: date
    end_date: date
    start_time: time | None = None  # Required when start_date == end_date
    end_time: time | None = None  # Required when start_date == end_date
    description: str | None = None

    @field_validator("start_date")
    @classmethod
    def validate_min_advance(cls, v: date) -> date:
        from datetime import date as date_type

        today = date_type.today()
        delta = (v - today).days
        if delta < 7:
            raise ValueError(
                "La solicitud debe realizarse con al menos 7 días de anticipación"
            )
        return v

    @field_validator("end_date")
    @classmethod
    def validate_date_range(cls, v: date, info) -> date:
        if "start_date" in info.data and v < info.data["start_date"]:
            raise ValueError("La fecha fin no puede ser anterior a la fecha inicio")
        return v

    @model_validator(mode="after")
    def validate_time_for_same_day(self) -> "PermissionRequestCreate":
        if self.start_date == self.end_date:
            if not self.start_time or not self.end_time:
                raise ValueError(
                    "Para solicitudes del mismo día, debe indicar hora inicio y hora fin"
                )
            if self.start_time >= self.end_time:
                raise ValueError("La hora fin debe ser posterior a la hora inicio")
        return self


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
    start_time: time | None = None
    end_time: time | None = None
    hours_affected: Decimal | None = None
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
