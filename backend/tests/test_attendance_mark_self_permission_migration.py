"""Tests for `202606191200_grant_attendance_mark_self_to_catedratico.py`.

Real gap this migration closes: `attendance.mark.self` was seeded (as a
`permissions` row) by `202606151200_split_administrativo_and_scopes.py`
but never granted to any role -- that migration deliberately stopped at
seeding the code (staged rollout), leaving the grant for the task that
wires up enforcement. Task 3.12's self-check-in scoping in
`backend/app/api/v1/endpoints/attendance.py` is that enforcement; this
migration is the matching grant, mirroring the
`202606161200`/`202606171200`/`202606181200` convention of one migration
per gate-replacement slice.
"""

import importlib.util
from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "202606191200_grant_attendance_mark_self_to_catedratico.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location(
        "attendance_mark_self_permission_migration", MIGRATION_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_chains_onto_attendance_reports_revision():
    module = _load_migration()
    assert module.down_revision == "202606181200"


def test_grants_attendance_mark_self_to_exactly_catedratico():
    module = _load_migration()
    assert set(module.ATTENDANCE_MARK_SELF_ROLES) == {"CATEDRATICO"}


def test_seeded_grant_matches_endpoint_enforced_role():
    # `_enforce_self_scope_if_catedratico` checks `UserRole.CATEDRATICO`
    # directly (role-based, not `require_permission`) -- this test proves
    # the granted role name matches that check, not a hand-copied string.
    from app.api.v1.endpoints.attendance import UserRole

    module = _load_migration()
    assert module.ATTENDANCE_MARK_SELF_ROLES == [UserRole.CATEDRATICO.value]


def test_upgrade_grants_only_attendance_mark_self_to_catedratico():
    module = _load_migration()
    import inspect

    source = inspect.getsource(module.upgrade)
    assert "role_permissions" in source
    assert "attendance.mark.self" in source
    assert "CATEDRATICO" in source
    assert "attendance.view" not in source
    assert "attendance.export" not in source


def test_downgrade_revokes_only_the_catedratico_grant():
    module = _load_migration()
    import inspect

    source = inspect.getsource(module.downgrade)
    assert "role_permissions" in source
    assert "attendance.mark.self" in source
    assert "CATEDRATICO" in source
