"""add must_change_password and employee_id to users

Revision ID: f1a2b3c4d5e6
Revises: 9f8e7d6c5b4a
Create Date: 2026-04-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'f1a2b3c4d5e6'
down_revision = '9f8e7d6c5b4a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default=sa.text('true')))
    op.add_column('users', sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_users_employee_id',
        'users', 'employees',
        ['employee_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_users_employee_id', 'users', type_='foreignkey')
    op.drop_column('users', 'employee_id')
    op.drop_column('users', 'must_change_password')
