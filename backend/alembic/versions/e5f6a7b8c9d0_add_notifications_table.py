"""add_notifications_table

Revision ID: e5f6a7b8c9d0
Revises: d1e2f3a4b5c6
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'e5f6a7b8c9d0'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'user_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id'),
            nullable=False,
        ),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column(
            'request_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('permission_requests.id'),
            nullable=True,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index(
        'ix_notifications_user_id',
        'notifications',
        ['user_id'],
    )
    op.create_index(
        'ix_notifications_user_id_read',
        'notifications',
        ['user_id', 'read'],
    )


def downgrade() -> None:
    op.drop_index('ix_notifications_user_id_read')
    op.drop_index('ix_notifications_user_id')
    op.drop_table('notifications')
