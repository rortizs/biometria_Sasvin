from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator, Field

from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None
    role: UserRole = UserRole.admin


class UserCreate(UserBase):
    password: str
    employee_id: UUID | None = None

    @field_validator("email")
    @classmethod
    def validate_umg_email(cls, v: str) -> str:
        if not v.endswith("@miumg.edu.gt"):
            raise ValueError("Solo se aceptan correos institucionales @miumg.edu.gt")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserPasswordChange(BaseModel):
    new_password: str = Field(..., min_length=8)


class UserResponse(UserBase):
    id: UUID
    is_active: bool
    must_change_password: bool = True
    employee_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AuthMeResponse(UserResponse):
    """`/auth/me`-only response: adds `permissions` (the current user's
    deduplicated, sorted permission codes, from
    `app.api.deps.permission_codes_for_user`) so the frontend can build
    permission-aware guards/UI instead of role-name string matching.

    Deliberately NOT added to the shared `UserResponse` -- `UserResponse`
    is also returned by `GET /users/` (list) and `GET /users/{id}`, whose
    queries do not eager-load `user_roles -> role -> permissions`
    (confirmed by reading `users.py`); adding a `permissions` field there
    would either raise on lazy-load in an async context or force an N+1
    query per listed user. `/auth/me`'s `current_user` always comes through
    `get_current_user()`, which already eager-loads that relationship.
    """

    permissions: list[str] = []


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    type: str
    exp: datetime


class ChangeFirstPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8)
