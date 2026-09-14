"""add missing schedule exception type enum values (BUG-05)

Revision ID: 202609141200
Revises: 202606201200
Create Date: 2026-09-14

Why this migration exists: the frontend `ExceptionType`
(frontend/src/app/core/models/schedule.model.ts) offers 13 exception
types, but the Postgres `exceptiontype` enum (created by
`add_schedule_assignments_exceptions.py`) only had 6
(`day_off, vacation, sick_leave, holiday, permission, other`), causing
`POST /schedules/exceptions` to return 422 for the other 7. This adds the
7 missing values to the existing DB enum type.

Upgrade: add `bereavement`, `medical_permission`, `work_letter`,
`compensatory`, `maternity_leave`, `paternity_leave`, `personal_day` to
the `exceptiontype` enum.

Downgrade: no-op. Postgres does not support removing a value from an
enum type without recreating it (same limitation documented by
`202606151200_split_administrativo_and_scopes.py` for the `userrole`
enum's `COORDINADOR`/`SECRETARIA` additions).
"""

from alembic import op


revision = "202609141200"
down_revision = "202606201200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE exceptiontype ADD VALUE IF NOT EXISTS 'bereavement'")
        op.execute("ALTER TYPE exceptiontype ADD VALUE IF NOT EXISTS 'medical_permission'")
        op.execute("ALTER TYPE exceptiontype ADD VALUE IF NOT EXISTS 'work_letter'")
        op.execute("ALTER TYPE exceptiontype ADD VALUE IF NOT EXISTS 'compensatory'")
        op.execute("ALTER TYPE exceptiontype ADD VALUE IF NOT EXISTS 'maternity_leave'")
        op.execute("ALTER TYPE exceptiontype ADD VALUE IF NOT EXISTS 'paternity_leave'")
        op.execute("ALTER TYPE exceptiontype ADD VALUE IF NOT EXISTS 'personal_day'")


def downgrade() -> None:
    # Postgres cannot remove a value from an enum type without recreating
    # it; no-op, same as the userrole COORDINADOR/SECRETARIA precedent.
    pass
