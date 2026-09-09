"""Tests for `202606161200_add_locations_permissions.py`.

Real gap this migration closes (discovered while implementing task 3.10's
`locations.py` portion): unlike `departments.*`/`positions.*`/
`schedules.*`, no `locations.*` permission code was ever seeded anywhere
in this codebase. Without this migration, `require_permission("locations
.create"/"update"/"delete")` in `locations.py` would deny every actor
except the hidden bootstrap `ADMIN` -- a functional regression, not the
intended staged-rollout gap (staged rollout assumes the permission row
already exists and only the role grant is missing).
"""

import importlib.util
from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "202606161200_add_locations_permissions.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("locations_permissions_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_chains_onto_split_administrativo_revision():
    module = _load_migration()
    assert module.down_revision == "202606151200"


def test_seeds_all_four_locations_permission_codes():
    module = _load_migration()
    codes = {code for code, *_ in module.LOCATIONS_PERMISSIONS}
    assert codes == {
        "locations.view",
        "locations.create",
        "locations.update",
        "locations.delete",
    }


def test_seeded_rows_match_locations_endpoint_required_codes():
    # These are exactly the codes `require_permission(...)` gates in
    # `backend/app/api/v1/endpoints/locations.py`'s write endpoints -- a
    # mismatch here would mean the endpoint gate can never be satisfied by
    # anyone but the hidden bootstrap admin, even after granting via the
    # Roles view.
    from app.api.v1.endpoints import locations as locations_endpoint

    module = _load_migration()
    seeded_codes = {code for code, *_ in module.LOCATIONS_PERMISSIONS}

    write_routes = [
        r
        for r in locations_endpoint.router.routes
        if getattr(r, "methods", set()) & {"POST", "PATCH", "DELETE"}
    ]
    for route in write_routes:
        for dependency in route.dependant.dependencies:
            import inspect

            nonlocals = inspect.getclosurevars(dependency.call).nonlocals
            if "code" in nonlocals:
                assert nonlocals["code"] in seeded_codes


def test_upgrade_grants_admin_and_dev_via_cross_join_sql():
    module = _load_migration()
    import inspect

    source = inspect.getsource(module.upgrade)
    assert "role_permissions" in source
    assert "'ADMIN', 'DEV'" in source
    assert "locations.%" in source
