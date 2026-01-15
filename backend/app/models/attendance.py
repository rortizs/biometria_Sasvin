import uuid
from datetime import datetime, date

from sqlalchemy import String, DateTime, Date, Float, Text, ForeignKey, UniqueConstraint, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    record_date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    check_out: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    check_in_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    check_out_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    check_in_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_out_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="present")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Geolocation fields - Check-in
    check_in_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_in_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_in_distance_meters: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Geolocation fields - Check-out
    check_out_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_out_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_out_distance_meters: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Geo validation flag
    geo_validated: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    employee: Mapped["Employee"] = relationship("Employee", back_populates="attendance_records")

    __table_args__ = (
        UniqueConstraint("employee_id", "record_date", name="uq_employee_date"),
    )
