import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, ARRAY, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Using native PostgreSQL ARRAY instead of pgvector for simplicity
    # For <10,000 employees, linear scan performance is acceptable (<100ms)
    # pgvector provides index optimization for millions of vectors (not needed for security)
    embedding = mapped_column(ARRAY(Float, dimensions=1), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    employee: Mapped["Employee"] = relationship(
        "Employee", back_populates="face_embeddings"
    )
