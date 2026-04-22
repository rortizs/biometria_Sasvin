from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PermissionResponse(BaseModel):
    id: UUID
    code: str
    module: str
    action: str
    scope: str
    description: str | None

    model_config = {"from_attributes": True}


class RoleBase(BaseModel):
    name: str
    description: str | None = None
    is_active: bool = True


class RoleCreate(RoleBase):
    permission_ids: list[UUID] = []


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class RoleResponse(RoleBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    permissions: list[PermissionResponse] = []

    model_config = {"from_attributes": True}


class UserRoleAssignmentResponse(BaseModel):
    id: UUID
    user_id: UUID
    role_id: UUID
    role: RoleResponse
    assigned_at: datetime
    assigned_by: UUID | None

    model_config = {"from_attributes": True}


class UserRoleAssign(BaseModel):
    role_ids: list[UUID]


# Fix forward reference
RoleResponse.model_rebuild()
