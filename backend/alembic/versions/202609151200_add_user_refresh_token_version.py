"""add user refresh token version

Revision ID: 202609151200
Revises: 202609141200
Create Date: 2026-09-15

Adds a per-user token version for dependency-free refresh-token rotation and
revocation on password changes/deactivation flows. Existing users start at 0,
which preserves currently issued refresh tokens that do not include a version
only until the endpoint begins requiring the claim.
"""

import sqlalchemy as sa  # type: ignore[import-not-found]
from alembic import op  # type: ignore[attr-defined]


revision = "202609151200"
down_revision = "202609141200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("refresh_token_version", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("users", "refresh_token_version", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "refresh_token_version")
