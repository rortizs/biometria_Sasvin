"""grant attendance.mark.self to CATEDRATICO

Revision ID: 202606191200
Revises: 202606181200
Create Date: 2026-06-19

Design: design.md Corrected Role Matrix ("CATEDRATICO: Dashboard = own,
Attendance reports = own"). Spec: attendance-access-control "Teacher
Attendance Scope" -- "CATEDRATICO marks own attendance".

Why this migration exists: `attendance.mark.self` was seeded (as a
`permissions` row) by `202606151200_split_administrativo_and_scopes.py`
but never granted to any role -- that migration deliberately stopped at
seeding the code, matching this change's staged "migrate -> populate
scopes -> enable enforcement" rollout, and left the actual grant for the
task that wires up enforcement (task 3.12's self-check-in scoping in
`backend/app/api/v1/endpoints/attendance.py`).

This migration only grants the code to `CATEDRATICO`; `check_in`/
`check_out` remain reachable without authentication (the shared
face-recognition kiosk flow keeps working exactly as before for every
caller that doesn't carry a Bearer token). `attendance.mark.self` is not
read via `require_permission` here -- the endpoint's optional-auth
self-scope guard (`_enforce_self_scope_if_catedratico`) checks the actor's
CATEDRATICO role directly, the same way `require_teacher_position`
doesn't need a permission-table round trip either. This grant exists so
`attendance.mark.self` is a real, satisfiable permission for `CATEDRATICO`
(matching the codebase's convention that every seeded permission code
ends up granted to at least the role it documents, even when the
enforcement call site checks role membership rather than
`has_permission()` directly, e.g. `require_teacher_position`) rather than
staying permanently inert.

Upgrade: grant the pre-existing `attendance.mark.self` permission to
`CATEDRATICO`.

Downgrade: revoke that same grant. Does not touch `roles`/`permissions`
rows (the permission code itself predates this migration and is owned by
`202606151200`), same non-destructive contract as `202606161200`/
`202606171200`/`202606181200`.
"""

from alembic import op
import sqlalchemy as sa


revision = "202606191200"
down_revision = "202606181200"
branch_labels = None
depends_on = None


ATTENDANCE_MARK_SELF_PERMISSION_CODE = "attendance.mark.self"
ATTENDANCE_MARK_SELF_ROLES = ["CATEDRATICO"]


def upgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name IN ('CATEDRATICO') "
            "AND p.code = 'attendance.mark.self' "
            "ON CONFLICT (role_id, permission_id) DO NOTHING"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE code = 'attendance.mark.self') "
            "AND role_id IN (SELECT id FROM roles WHERE name IN "
            "('CATEDRATICO'))"
        )
    )
