"""Tests for `202606201200_grant_permission_request_stage_approvals.py`.

Real gap this migration closes (discovered while implementing task 3.13's
two-stage transitions): `permission_requests.approve.stage1`/`.stage2` were
seeded by `202606151200_split_administrativo_and_scopes.py` but never
granted to any role -- that migration deliberately stopped at seeding the
code, matching this change's staged "migrate -> populate scopes -> enable
enforcement" rollout, and left the actual grant for the task that wires up
enforcement (task 3.13's stage transitions in
`backend/app/api/v1/endpoints/permission_requests.py`).
"""

import importlib.util
from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "202606201200_grant_permission_request_stage_approvals.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location(
        "permission_request_stage_approvals_migration", MIGRATION_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_chains_onto_attendance_mark_self_revision():
    module = _load_migration()
    assert module.down_revision == "202606191200"


def test_grants_stage1_to_exactly_coordinador():
    module = _load_migration()
    assert set(module.STAGE1_ROLES) == {"COORDINADOR"}


def test_grants_stage2_to_exactly_secretaria():
    module = _load_migration()
    assert set(module.STAGE2_ROLES) == {"SECRETARIA"}


def test_seeded_grants_match_permission_requests_endpoint_required_codes():
    # These are exactly the codes `has_permission(...)` checks in
    # `backend/app/api/v1/endpoints/permission_requests.py`'s
    # `approve_permission_request`/`reject_permission_request` -- a
    # mismatch here would mean the migration grants a code the endpoint
    # never checks, or vice versa.
    import inspect

    from app.api.v1.endpoints import permission_requests as pr_endpoint

    module = _load_migration()
    approve_source = inspect.getsource(pr_endpoint.approve_permission_request)
    reject_source = inspect.getsource(pr_endpoint.reject_permission_request)

    assert module.STAGE1_PERMISSION_CODE in approve_source
    assert module.STAGE1_PERMISSION_CODE in reject_source
    assert module.STAGE2_PERMISSION_CODE in approve_source
    assert module.STAGE2_PERMISSION_CODE in reject_source


def test_upgrade_grants_stage1_and_stage2_and_never_director():
    module = _load_migration()
    import inspect

    source = inspect.getsource(module.upgrade)
    assert "role_permissions" in source
    assert "permission_requests.approve.stage1" in source
    assert "permission_requests.approve.stage2" in source
    assert "COORDINADOR" in source
    assert "SECRETARIA" in source
    assert "DIRECTOR" not in source


def test_downgrade_revokes_both_grants_only():
    module = _load_migration()
    import inspect

    source = inspect.getsource(module.downgrade)
    assert "role_permissions" in source
    assert "permission_requests.approve.stage1" in source
    assert "permission_requests.approve.stage2" in source
    assert "COORDINADOR" in source
    assert "SECRETARIA" in source
