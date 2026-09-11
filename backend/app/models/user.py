import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    DEV = "DEV"
    DECANO = "DECANO"
    DUEÑO = "DUEÑO"
    DIRECTOR = "DIRECTOR"
    # Deprecated, non-assignable: PostgreSQL cannot DROP VALUE from an enum
    # without a type rebuild, and the Alembic downgrade path (B5) maps
    # COORDINADOR/SECRETARIA back to this value, so it must stay defined.
    # See design.md D1/D2.
    ADMINISTRATIVO = "ADMINISTRATIVO"
    COORDINADOR = "COORDINADOR"
    SECRETARIA = "SECRETARIA"
    CATEDRATICO = "CATEDRATICO"
    ESTUDIANTE = "ESTUDIANTE"
    PADRES = "PADRES"

    # Legacy attribute aliases used by existing endpoints/schemas.
    admin = "ADMIN"
    director = "DIRECTOR"
    administrativo = "ADMINISTRATIVO"
    coordinador = "COORDINADOR"
    secretaria = "SECRETARIA"
    catedratico = "CATEDRATICO"


CANONICAL_ROLE_VALUES = tuple(role.value for role in UserRole)

# Deprecated canonical role values that MUST NOT be assignable to a user
# through any API, even though they remain valid at the database enum
# level for backward compatibility (design.md D1).
DEPRECATED_ROLE_VALUES = frozenset({UserRole.ADMINISTRATIVO.value})

ASSIGNABLE_ROLE_VALUES = tuple(
    value for value in CANONICAL_ROLE_VALUES if value not in DEPRECATED_ROLE_VALUES
)

LEGACY_ROLE_MAPPING = {
    "admin": "ADMIN",
    "director": "DIRECTOR",
    "coordinador": "COORDINADOR",
    "secretaria": "SECRETARIA",
    "supervisor": "COORDINADOR",
    "catedratico": "CATEDRATICO",
}


def canonical_role_from_value(
    value: str | UserRole | None,
    *,
    user_email: str | None = None,
    bootstrap_admin_email: str | None = None,
    legacy_admin_fallback_role: str = "DECANO",
) -> UserRole | None:
    if value is None:
        return None
    if isinstance(value, UserRole):
        return value

    normalized = str(value).strip()
    if not normalized:
        return None

    uppercase = normalized.upper()
    if uppercase in UserRole._value2member_map_:
        return UserRole(uppercase)

    legacy = normalized.lower()
    if legacy == "admin" and user_email and bootstrap_admin_email:
        if user_email.casefold() != bootstrap_admin_email.casefold():
            return canonical_role_from_value(legacy_admin_fallback_role)

    mapped = LEGACY_ROLE_MAPPING.get(legacy)
    return UserRole(mapped) if mapped else None


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), nullable=False, default=UserRole.ADMIN
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships (RBAC many-to-many via UserRoleAssignment)
    user_roles: Mapped[list["UserRoleAssignment"]] = relationship(
        "UserRoleAssignment",
        foreign_keys="[UserRoleAssignment.user_id]",
        back_populates="user",
        cascade="all, delete-orphan",
    )
