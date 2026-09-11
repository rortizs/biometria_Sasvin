import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# Design.md D4: exactly one of department_id/location_id/director_user_id
# MUST be set per row. Serves three scope shapes with one admin surface:
#   - COORDINADOR / DIRECTOR -> facultad (department_id) and/or sede
#     (location_id)
#   - SECRETARIA -> assigned DIRECTOR (director_user_id), 1:N in both
#     directions
_EXACTLY_ONE_TARGET_SQL = (
    "(CASE WHEN department_id IS NOT NULL THEN 1 ELSE 0 END + "
    "CASE WHEN location_id IS NOT NULL THEN 1 ELSE 0 END + "
    "CASE WHEN director_user_id IS NOT NULL THEN 1 ELSE 0 END) = 1"
)


class UserScopeAssignment(Base):
    """Organizational scope binding (design.md D4).

    NOTE (task 3.4b): design.md D4's literal "unique index on the triple"
    wording was implemented first as a single UniqueConstraint over
    (user_id, department_id, location_id, director_user_id). That was
    proven NOT to reject duplicates: because the CHECK constraint below
    forces exactly one target column to be non-null per row, the other two
    columns are always NULL on both sides of a "duplicate" pair, and ANSI
    SQL treats NULL <> NULL for uniqueness purposes -- so the constraint
    never fired (see git history / apply-progress.md for the original
    finding and test). This is replaced here by three separate PARTIAL
    unique indexes, one per nullable target column, each scoped to rows
    where that column IS NOT NULL. This is the standard pattern for
    "unique across nullable columns" and is the only correct fix given the
    CHECK constraint's own "exactly one target" invariant.
    """

    __tablename__ = "user_scope_assignments"
    __table_args__ = (
        CheckConstraint(
            _EXACTLY_ONE_TARGET_SQL,
            name="ck_user_scope_assignments_exactly_one_target",
        ),
        Index(
            "uq_user_scope_assignments_department",
            "user_id",
            "department_id",
            unique=True,
            postgresql_where=text("department_id IS NOT NULL"),
            sqlite_where=text("department_id IS NOT NULL"),
        ),
        Index(
            "uq_user_scope_assignments_location",
            "user_id",
            "location_id",
            unique=True,
            postgresql_where=text("location_id IS NOT NULL"),
            sqlite_where=text("location_id IS NOT NULL"),
        ),
        Index(
            "uq_user_scope_assignments_director",
            "user_id",
            "director_user_id",
            unique=True,
            postgresql_where=text("director_user_id IS NOT NULL"),
            sqlite_where=text("director_user_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=True,
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=True,
    )
    director_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    department: Mapped["Department | None"] = relationship(
        "Department", foreign_keys=[department_id]
    )
    location: Mapped["Location | None"] = relationship(
        "Location", foreign_keys=[location_id]
    )
    director: Mapped["User | None"] = relationship(
        "User", foreign_keys=[director_user_id]
    )
