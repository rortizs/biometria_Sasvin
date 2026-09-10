"""grant permission_requests.approve.stage1/stage2 to COORDINADOR/SECRETARIA

Revision ID: 202606201200
Revises: 202606191200
Create Date: 2026-06-20

Design: design.md D7, D10, "Two-Stage State Machine". Spec:
permission-request-workflow "Stage 1 Coordinator Review", "Stage 2
Secretaría Review".

Why this migration exists: `permission_requests.approve.stage1`/`.stage2`
were seeded (as `permissions` rows) by
`202606151200_split_administrativo_and_scopes.py` but deliberately never
granted to any role -- that migration's own docstring says "no
role_permissions grants yet -- gate replacement is a later, separate
task", matching this change's staged "migrate -> populate scopes -> enable
enforcement" rollout. Task 3.13 wires `has_permission(actor,
"permission_requests.approve.stage1"/".stage2")` into
`backend/app/api/v1/endpoints/permission_requests.py`'s `approve`/`reject`
endpoints; without this grant every `COORDINADOR`/`SECRETARIA` actor would
be denied at the stage they should own, a functional regression (same
class of staged-rollout gap as `202606161200`/`202606171200`/
`202606181200`/`202606191200`).

Deliberately does NOT grant either stage code to `DIRECTOR` -- spec:
"DIRECTOR cannot approve or deny" (design.md D7: DIRECTOR is read +
notification only, never a decision-maker at either stage).

Upgrade: grant `permission_requests.approve.stage1` to `COORDINADOR` and
`permission_requests.approve.stage2` to `SECRETARIA`.

Downgrade: revoke both grants. Does not touch `roles`/`permissions` rows
(both codes predate this migration and are owned by `202606151200`), same
non-destructive contract as `202606161200`/`202606171200`/`202606181200`/
`202606191200`.
"""

from alembic import op
import sqlalchemy as sa


revision = "202606201200"
down_revision = "202606191200"
branch_labels = None
depends_on = None


STAGE1_PERMISSION_CODE = "permission_requests.approve.stage1"
STAGE1_ROLES = ["COORDINADOR"]
STAGE2_PERMISSION_CODE = "permission_requests.approve.stage2"
STAGE2_ROLES = ["SECRETARIA"]


def upgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name IN ('COORDINADOR') "
            "AND p.code = 'permission_requests.approve.stage1' "
            "ON CONFLICT (role_id, permission_id) DO NOTHING"
        )
    )
    bind.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name IN ('SECRETARIA') "
            "AND p.code = 'permission_requests.approve.stage2' "
            "ON CONFLICT (role_id, permission_id) DO NOTHING"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE code = 'permission_requests.approve.stage1') "
            "AND role_id IN (SELECT id FROM roles WHERE name IN ('COORDINADOR'))"
        )
    )
    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE code = 'permission_requests.approve.stage2') "
            "AND role_id IN (SELECT id FROM roles WHERE name IN ('SECRETARIA'))"
        )
    )
