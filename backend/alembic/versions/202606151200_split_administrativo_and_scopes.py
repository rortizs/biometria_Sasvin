"""split ADMINISTRATIVO into COORDINADOR/SECRETARIA, add organizational
scope model

Revision ID: 202606151200
Revises: 202606101200
Create Date: 2026-06-15

Design: design.md D1-D6. Spec: rbac-access-model "Organizational Scope
Assignment", "Legacy Role Migration Compatibility".

Upgrade:
  1. Add `COORDINADOR`/`SECRETARIA` DB enum values to `userrole`.
  2. Seed `roles` rows for `COORDINADOR`/`SECRETARIA` and the new
     permission rows this slice introduces (no role_permissions grants yet
     -- gate replacement is a later, separate task; per the design's staged
     rollout note this is intentional: migrate -> populate scopes -> enable
     enforcement).
  3. Create `user_scope_assignments` (D4) and add `positions.canonical_role`
     (D6, left NULL -- no backfill, per design's own rationale).
  4. Reclassify existing `ADMINISTRATIVO` users via the D3 ladder
     (`resolve_reclassification`) and write one `audit_logs` row per
     ambiguous (rung 3) reclassification.

Downgrade: merges `COORDINADOR`/`SECRETARIA` back to `ADMINISTRATIVO`, drops
the new table/column/permission rows. Preserves the B5 non-destructive
contract from `202606101200`: no `user_roles` or `roles` row is ever
deleted, so no role assignment is lost.
"""

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "202606151200"
down_revision = "202606101200"
branch_labels = None
depends_on = None


NEW_ROLES = [
    {
        "name": "COORDINADOR",
        "description": "Facultad/sede-scoped academic coordination; stage-1 permission-request approval",
    },
    {
        "name": "SECRETARIA",
        "description": "Director-scoped administrative support; catedratico employee management; stage-2 permission-request approval",
    },
]

NEW_PERMISSIONS = [
    (
        "user_scopes.manage",
        "user_scopes",
        "manage",
        "global",
        "Manage organizational scope assignments for coordinador/director/secretaria",
    ),
    (
        "employees.manage.catedratico",
        "employees",
        "manage",
        "catedratico",
        "Create/update employee records mapped to a teaching (CATEDRATICO) position",
    ),
    (
        "attendance.mark.self",
        "attendance",
        "mark",
        "self",
        "Self check-in/check-out attendance for the authenticated employee",
    ),
    (
        "permission_requests.approve.stage1",
        "permission_requests",
        "approve",
        "stage1",
        "Coordinador stage-1 approval/rejection of a permission request",
    ),
    (
        "permission_requests.approve.stage2",
        "permission_requests",
        "approve",
        "stage2",
        "Secretaria stage-2 approval/rejection of a permission request with mandatory justification",
    ),
]

# D3 rung 1: a surviving `roles.name` value in `user_roles` (from before
# 202606101200 collapsed coordinador/secretaria into ADMINISTRATIVO and
# deleted these `user_roles` rows) that still distinguishes the two.
_RUNG1_ROLE_NAMES = {"coordinador": "COORDINADOR", "secretaria": "SECRETARIA"}

# D3 rung 2: `positions.canonical_role` values that disambiguate the split.
_RUNG2_CANONICAL_ROLES = {"COORDINADOR", "SECRETARIA"}


def resolve_reclassification(
    legacy_role_name: str | None,
    position_canonical_role: str | None,
) -> dict:
    """Pure D3 reclassification ladder (design.md D3).

    Rung 1: surviving `roles.name` in `user_roles`.
    Rung 2: `positions.canonical_role` via `users.employee_id`.
    Rung 3: fallback `COORDINADOR`, unscoped, flagged ambiguous for audit.

    Returns ``{"new_role": str, "rung": int, "ambiguous": bool}``.
    """
    if legacy_role_name:
        rung1_match = _RUNG1_ROLE_NAMES.get(legacy_role_name.strip().lower())
        if rung1_match:
            return {"new_role": rung1_match, "rung": 1, "ambiguous": False}

    if position_canonical_role:
        rung2_match = position_canonical_role.strip().upper()
        if rung2_match in _RUNG2_CANONICAL_ROLES:
            return {"new_role": rung2_match, "rung": 2, "ambiguous": False}

    return {"new_role": "COORDINADOR", "rung": 3, "ambiguous": True}


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # 1. DB enum value additions
    # ------------------------------------------------------------------
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'COORDINADOR'")
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'SECRETARIA'")

    # ------------------------------------------------------------------
    # 2. Seed roles + new permission rows
    # ------------------------------------------------------------------
    for role in NEW_ROLES:
        bind.execute(
            sa.text(
                "INSERT INTO roles (id, name, description, is_active, created_at, updated_at) "
                "VALUES (:id, :name, :description, true, NOW(), NOW()) "
                "ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, "
                "is_active = true, updated_at = NOW()"
            ),
            {"id": str(uuid.uuid4()), **role},
        )

    for code, module, action, scope, description in NEW_PERMISSIONS:
        bind.execute(
            sa.text(
                "INSERT INTO permissions (id, code, module, action, scope, description, created_at) "
                "VALUES (:id, :code, :module, :action, :scope, :description, NOW()) "
                "ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
            ),
            {
                "id": str(uuid.uuid4()),
                "code": code,
                "module": module,
                "action": action,
                "scope": scope,
                "description": description,
            },
        )

    # ------------------------------------------------------------------
    # 3. user_scope_assignments (D4) + positions.canonical_role (D6)
    # ------------------------------------------------------------------
    op.create_table(
        "user_scope_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "department_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "location_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("locations.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "director_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "(CASE WHEN department_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN location_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN director_user_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_user_scope_assignments_exactly_one_target",
        ),
    )
    op.create_index(
        "ix_user_scope_assignments_user_id", "user_scope_assignments", ["user_id"]
    )

    # Task 3.4b: three partial unique indexes replace a broken plain
    # UNIQUE(user_id, department_id, location_id, director_user_id)
    # constraint. Because the CHECK constraint above forces exactly one
    # target column non-null per row, the other two are always NULL on
    # both sides of a would-be duplicate pair, and ANSI SQL treats
    # NULL <> NULL for uniqueness -- so a plain multi-column UNIQUE
    # constraint never rejects the duplicate. A partial unique index per
    # target column (active only WHERE that column IS NOT NULL) is the
    # standard, correct fix. See
    # backend/app/models/user_scope_assignment.py for the matching
    # SQLAlchemy model definition and
    # backend/tests/test_user_scope_assignment.py for behavioral proof.
    op.create_index(
        "uq_user_scope_assignments_department",
        "user_scope_assignments",
        ["user_id", "department_id"],
        unique=True,
        postgresql_where=sa.text("department_id IS NOT NULL"),
    )
    op.create_index(
        "uq_user_scope_assignments_location",
        "user_scope_assignments",
        ["user_id", "location_id"],
        unique=True,
        postgresql_where=sa.text("location_id IS NOT NULL"),
    )
    op.create_index(
        "uq_user_scope_assignments_director",
        "user_scope_assignments",
        ["user_id", "director_user_id"],
        unique=True,
        postgresql_where=sa.text("director_user_id IS NOT NULL"),
    )

    op.add_column(
        "positions", sa.Column("canonical_role", sa.String(length=50), nullable=True)
    )

    # ------------------------------------------------------------------
    # 4. D3 reclassification ladder for existing ADMINISTRATIVO users
    # ------------------------------------------------------------------
    administrativo_users = bind.execute(
        sa.text(
            "SELECT id, employee_id FROM users WHERE role::text = 'ADMINISTRATIVO'"
        )
    ).fetchall()

    for row in administrativo_users:
        rung1_signal = bind.execute(
            sa.text(
                "SELECT r.name FROM user_roles ur "
                "JOIN roles r ON r.id = ur.role_id "
                "WHERE ur.user_id = :user_id AND r.name IN ('coordinador', 'secretaria') "
                "LIMIT 1"
            ),
            {"user_id": row.id},
        ).scalar_one_or_none()

        rung2_signal = None
        if row.employee_id is not None:
            rung2_signal = bind.execute(
                sa.text(
                    "SELECT p.canonical_role FROM employees e "
                    "JOIN positions p ON p.id = e.position_id "
                    "WHERE e.id = :employee_id"
                ),
                {"employee_id": row.employee_id},
            ).scalar_one_or_none()

        outcome = resolve_reclassification(rung1_signal, rung2_signal)
        new_role = outcome["new_role"]

        bind.execute(
            sa.text("UPDATE users SET role = CAST(:new_role AS userrole) WHERE id = :user_id"),
            {"new_role": new_role, "user_id": row.id},
        )

        # Resync user_roles: drop the stale ADMINISTRATIVO grant, add the
        # new COORDINADOR/SECRETARIA grant. Additive upgrade-time resync --
        # not the B5 non-destructive downgrade contract, which only applies
        # to downgrade().
        bind.execute(
            sa.text(
                "DELETE FROM user_roles WHERE user_id = :user_id AND role_id IN "
                "(SELECT id FROM roles WHERE name = 'ADMINISTRATIVO')"
            ),
            {"user_id": row.id},
        )
        bind.execute(
            sa.text(
                "INSERT INTO user_roles (id, user_id, role_id, assigned_at) "
                "SELECT :assignment_id, :user_id, r.id, NOW() FROM roles r "
                "WHERE r.name = :new_role "
                "ON CONFLICT (user_id, role_id) DO NOTHING"
            ),
            {
                "assignment_id": str(uuid.uuid4()),
                "user_id": row.id,
                "new_role": new_role,
            },
        )

        if outcome["ambiguous"]:
            bind.execute(
                sa.text(
                    "INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, created_at) "
                    "VALUES (:id, :user_id, 'assign', 'user_role_reclassification', :user_id, "
                    "CAST(:details AS jsonb), NOW())"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "user_id": row.id,
                    "details": (
                        '{"old_role": "ADMINISTRATIVO", "new_role": "%s", "rung": %d, '
                        '"ambiguous": true, '
                        '"reason": "no surviving roles.name or positions.canonical_role '
                        'signal disambiguated coordinador vs secretaria; landed on '
                        'least-privilege unscoped COORDINADOR per design.md D3 -- '
                        'needs manual review"}'
                    )
                    % (new_role, outcome["rung"]),
                },
            )


def downgrade() -> None:
    bind = op.get_bind()

    # Merge COORDINADOR/SECRETARIA back to ADMINISTRATIVO. Same B5
    # non-destructive contract as 202606101200: never DELETE FROM
    # user_roles or roles, so no role assignment is lost.
    bind.execute(
        sa.text(
            "UPDATE users SET role = CASE "
            "WHEN role::text = 'COORDINADOR' THEN 'ADMINISTRATIVO'::userrole "
            "WHEN role::text = 'SECRETARIA' THEN 'ADMINISTRATIVO'::userrole "
            "ELSE role::text END::userrole"
        )
    )

    bind.execute(
        sa.text(
            "DELETE FROM permissions WHERE code IN ("
            "'user_scopes.manage', 'employees.manage.catedratico', "
            "'attendance.mark.self', 'permission_requests.approve.stage1', "
            "'permission_requests.approve.stage2')"
        )
    )

    op.drop_column("positions", "canonical_role")

    # Task 3.4b: explicit drops of the three partial unique indexes, mirroring
    # their explicit creation in upgrade(). drop_table() below would also
    # implicitly remove them, but dropping explicitly keeps upgrade/downgrade
    # symmetric and self-documenting.
    op.drop_index(
        "uq_user_scope_assignments_department", table_name="user_scope_assignments"
    )
    op.drop_index(
        "uq_user_scope_assignments_location", table_name="user_scope_assignments"
    )
    op.drop_index(
        "uq_user_scope_assignments_director", table_name="user_scope_assignments"
    )
    op.drop_index("ix_user_scope_assignments_user_id", table_name="user_scope_assignments")
    op.drop_table("user_scope_assignments")
