import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import String, Boolean, DateTime, Date, ForeignKey, Enum, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PermissionRequestStatus(str, PyEnum):
    pending              = "pending"
    coordinator_approved = "coordinator_approved"
    approved             = "approved"
    rejected             = "rejected"


class RejectionStage(str, PyEnum):
    coordinator = "coordinator"
    director    = "director"


class PermissionRequest(Base):
    __tablename__ = "permission_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Who requested and for which employee
    requested_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False
    )

    # Request details
    exception_type: Mapped[str] = mapped_column(String, nullable=False)
    start_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    end_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status
    status: Mapped[PermissionRequestStatus] = mapped_column(
        Enum(PermissionRequestStatus),
        nullable=False,
        default=PermissionRequestStatus.pending,
    )

    # Coordinator review
    coordinator_reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    coordinator_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    coordinator_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Director review
    director_reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    director_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    director_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Rejection
    rejection_stage: Mapped[RejectionStage | None] = mapped_column(
        Enum(RejectionStage), nullable=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Link to created exception when approved
    schedule_exception_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedule_exceptions.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    requested_by: Mapped["User"] = relationship(
        "User", foreign_keys=[requested_by_user_id]
    )
    employee: Mapped["Employee"] = relationship("Employee")
    coordinator_reviewer: Mapped["User"] = relationship(
        "User", foreign_keys=[coordinator_reviewed_by]
    )
    director_reviewer: Mapped["User"] = relationship(
        "User", foreign_keys=[director_reviewed_by]
    )
