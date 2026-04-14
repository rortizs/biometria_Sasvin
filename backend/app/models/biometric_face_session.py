import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class BiometricFaceSession(Base):
    __tablename__ = "biometric_face_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    stage_metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    liveness_delta: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 6), nullable=True
    )
    capture_origin: Mapped[str | None] = mapped_column(String(100), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="started", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    employee: Mapped["Employee"] = relationship(
        "Employee", back_populates="biometric_face_sessions"
    )
