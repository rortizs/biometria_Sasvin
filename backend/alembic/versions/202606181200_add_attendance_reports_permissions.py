"""grant attendance.view to the four read-only reporting roles

Revision ID: 202606181200
Revises: 202606171200
Create Date: 2026-06-18

Design: design.md D10 (retire coarse role gates in favor of
`require_permission(...)`), Corrected Role Matrix (DECANO/DUEÑO/DIRECTOR/
COORDINADOR: attendance reports = read). Spec: attendance-access-control
"Administrative Attendance Access" -- "Business and academic roles access
read-only attendance reports".

Why this migration exists: `attendance.view`/`attendance.export` were
seeded by the legacy migration `9f8e7d6c5b4a`, but only granted there to
the now-orphaned lowercase legacy roles (`director`, `coordinador`,
`secretaria`, `catedratico`) -- `202606101200` deleted every `user_roles`
row pointing at those lowercase roles (see its own `DELETE FROM
user_roles WHERE role_id IN (SELECT id FROM roles WHERE name IN
('admin','director','coordinador','secretaria','supervisor',
'catedratico'))`) and never re-granted the codes to the new canonical
uppercase roles. `backend/app/api/v1/endpoints/attendance.py`'s task-3.12
gate replacement swaps the coarse `get_current_user`-only reads for
`require_permission("attendance.view")` -- without this migration,
`has_permission()` would return `False` for every actor except the
hidden bootstrap `ADMIN`, the same class of functional-regression gap
already documented and fixed by `202606161200`/`202606171200`.

Deliberately does NOT grant `attendance.export` to any of the four roles:
the spec's "MUST deny any create, update, delete, or export action on
that report" applies uniformly to DECANO/DUEÑO/DIRECTOR/COORDINADOR --
none of them gets an export exception. `attendance.py` has no
export/edit/delete route at all today, so this is a defense-in-depth
grant boundary, not a functional gate (see
`test_no_export_edit_or_delete_attendance_routes_exist`).

`SECRETARIA` and `CATEDRATICO` are intentionally NOT granted
`attendance.view` here -- the MODIFIED spec requirement's own scenario
text ("Business and academic roles access read-only attendance reports")
names only DECANO/DUEÑO/DIRECTOR/COORDINADOR, and task 3.12's literal
scope text does not ask for a SECRETARIA/CATEDRATICO grant on this
endpoint (design.md's Corrected Role Matrix does list SECRETARIA:
"Attendance reports: read", which this migration does NOT implement --
flagged as an open design/spec inconsistency in apply-progress.md rather
than resolved by assumption here).

Upgrade: grant the pre-existing `attendance.view` permission to
`DECANO`/`DUEÑO`/`DIRECTOR`/`COORDINADOR`.

Downgrade: revoke that same grant. Does not touch `roles`/`permissions`
rows (the permission code itself predates this migration and is owned by
`9f8e7d6c5b4a`), same non-destructive contract as `202606161200`/
`202606171200`.
"""

from alembic import op
import sqlalchemy as sa


revision = "202606181200"
down_revision = "202606171200"
branch_labels = None
depends_on = None


ATTENDANCE_PERMISSION_CODE = "attendance.view"
ATTENDANCE_REPORT_ROLES = ["DECANO", "DUEÑO", "DIRECTOR", "COORDINADOR"]


def upgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name IN ('DECANO', 'DUEÑO', 'DIRECTOR', 'COORDINADOR') "
            "AND p.code = 'attendance.view' "
            "ON CONFLICT (role_id, permission_id) DO NOTHING"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE code = 'attendance.view') "
            "AND role_id IN (SELECT id FROM roles WHERE name IN "
            "('DECANO', 'DUEÑO', 'DIRECTOR', 'COORDINADOR'))"
        )
    )
