"""Tests for `202606181200_add_attendance_reports_permissions.py`.

Real gap this migration closes (discovered while implementing task 3.12's
read-only-reports slice): `attendance.view`/`attendance.export` were
seeded by the legacy migration `9f8e7d6c5b4a`, but only granted there to
the now-orphaned LOWERCASE legacy roles (`director`, `coordinador`,
`secretaria`, `catedratico`) -- `202606101200` deleted every `user_roles`
row pointing at those lowercase roles and never re-granted the codes to
the new canonical UPPERCASE roles (`DECANO`, `DUEÑO`, `DIRECTOR`,
`COORDINADOR`). Without this migration, `require_permission("attendance
.view")` in `attendance.py`'s `list_attendance`/`list_today_attendance`
would deny every actor except the hidden bootstrap `ADMIN` -- a functional
regression, not the intended staged-rollout gap (same class of gap as
`202606161200`/`202606171200`).

Deliberately does NOT grant `attendance.export` to any of these four
roles -- spec: attendance-access-control "Administrative Attendance
Access" -- "the backend MUST deny any create, update, delete, or export
action on that report" for DECANO/DUEÑO/DIRECTOR/COORDINADOR alike (no
role gets an export exception in this migration).
"""

import importlib.util
from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "202606181200_add_attendance_reports_permissions.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location(
        "attendance_reports_permissions_migration", MIGRATION_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_chains_onto_faces_permissions_revision():
    module = _load_migration()
    assert module.down_revision == "202606171200"


def test_grants_attendance_view_to_exactly_the_four_read_only_roles():
    module = _load_migration()
    assert set(module.ATTENDANCE_REPORT_ROLES) == {
        "DECANO",
        "DUEÑO",
        "DIRECTOR",
        "COORDINADOR",
    }


def test_seeded_grant_matches_attendance_endpoint_required_code():
    # This is exactly the code `require_permission(...)` gates in
    # `backend/app/api/v1/endpoints/attendance.py`'s read endpoints -- a
    # mismatch here would mean the migration grants a code the endpoint
    # never checks, or vice versa.
    import inspect

    from app.api.v1.endpoints import attendance as attendance_endpoint

    module = _load_migration()

    read_routes = [
        r
        for r in attendance_endpoint.router.routes
        if getattr(r, "methods", set()) & {"GET"}
    ]
    assert read_routes, "expected at least one GET route in attendance.py"
    for route in read_routes:
        for dependency in route.dependant.dependencies:
            nonlocals = inspect.getclosurevars(dependency.call).nonlocals
            if "code" in nonlocals:
                assert nonlocals["code"] == module.ATTENDANCE_PERMISSION_CODE


def test_upgrade_grants_only_attendance_view_not_export():
    module = _load_migration()
    import inspect

    source = inspect.getsource(module.upgrade)
    assert "role_permissions" in source
    assert "attendance.view" in source
    assert "attendance.export" not in source
    for role in ("DECANO", "DUEÑO", "DIRECTOR", "COORDINADOR"):
        assert role in source


def test_downgrade_revokes_only_the_four_roles_grant():
    module = _load_migration()
    import inspect

    source = inspect.getsource(module.downgrade)
    assert "role_permissions" in source
    assert "attendance.view" in source
    for role in ("DECANO", "DUEÑO", "DIRECTOR", "COORDINADOR"):
        assert role in source
