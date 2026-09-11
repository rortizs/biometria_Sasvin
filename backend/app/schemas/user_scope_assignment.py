from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, model_validator


class UserScopeAssignmentCreate(BaseModel):
    """Design.md D4: exactly one of department_id/location_id/director_user_id
    MUST be set. Mirrors the DB `ck_user_scope_assignments_exactly_one_target`
    CHECK constraint at the API validation layer so a bad request returns a
    clean 422 instead of relying only on the DB constraint (which would
    surface as an opaque 500 via an unhandled IntegrityError)."""

    user_id: UUID
    department_id: UUID | None = None
    location_id: UUID | None = None
    director_user_id: UUID | None = None

    @model_validator(mode="after")
    def _exactly_one_target(self) -> "UserScopeAssignmentCreate":
        targets = (self.department_id, self.location_id, self.director_user_id)
        if sum(1 for target in targets if target is not None) != 1:
            raise ValueError(
                "Exactly one of department_id, location_id, director_user_id must be set"
            )
        return self


class UserScopeAssignmentResponse(BaseModel):
    id: UUID
    user_id: UUID
    department_id: UUID | None
    location_id: UUID | None
    director_user_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
