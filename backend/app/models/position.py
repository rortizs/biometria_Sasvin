import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Position(Base):
    """Puestos: Coordinador, Catedrático, Alumno, etc."""
    __tablename__ = "positions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Design.md D6: nullable, admin-populated mapping from this position to a
    # canonical UserRole value (e.g. "CATEDRATICO"). Used by
    # `require_teacher_position` to gate SECRETARIA employee writes to
    # teaching positions only, and by the D3 reclassification ladder's rung
    # 2. Not backfilled by migration — no brittle string matching on `name`.
    canonical_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    employees: Mapped[list["Employee"]] = relationship(
        "Employee", back_populates="position_rel"
    )
