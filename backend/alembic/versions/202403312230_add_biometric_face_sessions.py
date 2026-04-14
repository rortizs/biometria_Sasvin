"""add_biometric_face_sessions

Revision ID: c7b4f2a8cd01
Revises: b2c3d4e5f6g7
Create Date: 2026-03-31 22:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c7b4f2a8cd01"
down_revision: Union[str, None] = "b2c3d4e5f6g7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "biometric_face_sessions",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False
        ),
        sa.Column(
            "employee_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("stage_metrics", postgresql.JSONB, nullable=True),
        sa.Column("liveness_delta", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("capture_origin", sa.String(length=100), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column(
            "status", sa.String(length=50), nullable=False, server_default="started"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_biometric_face_sessions_employee_created",
        "biometric_face_sessions",
        ["employee_id", "created_at"],
    )
    op.create_index(
        "ux_biometric_face_sessions_session_id",
        "biometric_face_sessions",
        ["session_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ux_biometric_face_sessions_session_id", table_name="biometric_face_sessions"
    )
    op.drop_index(
        "ix_biometric_face_sessions_employee_created",
        table_name="biometric_face_sessions",
    )
    op.drop_table("biometric_face_sessions")
