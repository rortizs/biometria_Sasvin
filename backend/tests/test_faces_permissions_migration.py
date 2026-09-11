"""Tests for `202606171200_add_faces_permissions.py`.

Real gap this migration closes (discovered while implementing task 3.11's
`faces.py` gate replacement): unlike `settings.*`, no `faces.*` permission
code was ever seeded anywhere in this codebase. Without this migration,
`require_permission("faces.create"/"faces.delete")` in `faces.py` would
deny every actor except the hidden bootstrap `ADMIN` -- a functional
regression, not the intended staged-rollout gap (staged rollout assumes
the permission row already exists and only the role grant is missing).
"""

import importlib.util
from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "202606171200_add_faces_permissions.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("faces_permissions_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_chains_onto_locations_permissions_revision():
    module = _load_migration()
    assert module.down_revision == "202606161200"


def test_seeds_both_faces_permission_codes():
    module = _load_migration()
    codes = {code for code, *_ in module.FACES_PERMISSIONS}
    assert codes == {"faces.create", "faces.delete"}


def test_seeded_rows_match_faces_endpoint_required_codes():
    # These are exactly the codes `require_permission(...)` gates in
    # `backend/app/api/v1/endpoints/faces.py`'s write endpoints -- a
    # mismatch here would mean the endpoint gate can never be satisfied by
    # anyone but the hidden bootstrap admin, even after granting via the
    # Roles view.
    import inspect

    from app.api.v1.endpoints import faces as faces_endpoint

    module = _load_migration()
    seeded_codes = {code for code, *_ in module.FACES_PERMISSIONS}

    write_routes = [
        r
        for r in faces_endpoint.router.routes
        if getattr(r, "methods", set()) & {"POST", "DELETE"} and r.path != "/verify"
    ]
    assert write_routes, "expected register/delete routes to exist"
    for route in write_routes:
        for dependency in route.dependant.dependencies:
            nonlocals = inspect.getclosurevars(dependency.call).nonlocals
            if "code" in nonlocals:
                assert nonlocals["code"] in seeded_codes


def test_upgrade_grants_admin_and_dev_via_cross_join_sql():
    module = _load_migration()
    import inspect

    source = inspect.getsource(module.upgrade)
    assert "role_permissions" in source
    assert "'ADMIN', 'DEV'" in source
    assert "faces.%" in source
