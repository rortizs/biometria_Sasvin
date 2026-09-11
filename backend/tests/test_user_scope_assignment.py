"""Tests for the D4 organizational scope model and the D3 reclassification
ladder used by the `split_administrativo_and_scopes` migration.

Spec: rbac-access-model "Organizational Scope Assignment",
"Ambiguous migrated ADMINISTRATIVO user lands on unscoped COORDINADOR and is
audited". Design: design.md D3, D4.

DB-constraint tests use an in-memory SQLite engine to exercise the real
`CheckConstraint`/`UniqueConstraint` SQL text end-to-end (SQLite supports the
`CASE WHEN ... END` CHECK expression and compiles
`sqlalchemy.dialects.postgresql.UUID` columns without error). This is a
genuine behavioral proof of the constraint definitions, but it is NOT a
substitute for running the actual Alembic migration against a live
PostgreSQL instance -- no such instance was available in this environment
(see apply-progress for the explicit static-vs-runtime verification
breakdown).
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user_scope_assignment import UserScopeAssignment


def _memory_engine():
    engine = create_engine("sqlite:///:memory:")
    UserScopeAssignment.metadata.create_all(
        engine, tables=[UserScopeAssignment.__table__]
    )
    return engine


def _load_split_migration():
    migration_path = next(
        (Path(__file__).parents[1] / "alembic" / "versions").glob(
            "*_split_administrativo_and_scopes.py"
        )
    )
    spec = importlib.util.spec_from_file_location(
        "split_administrativo_and_scopes", migration_path
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# CHECK constraint: exactly one of department_id/location_id/director_user_id
# ---------------------------------------------------------------------------


def test_check_constraint_rejects_zero_targets():
    engine = _memory_engine()
    with Session(engine) as session:
        session.add(UserScopeAssignment(id=uuid.uuid4(), user_id=uuid.uuid4()))
        with pytest.raises(IntegrityError):
            session.commit()


def test_check_constraint_rejects_two_targets_at_once():
    engine = _memory_engine()
    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                department_id=uuid.uuid4(),
                location_id=uuid.uuid4(),
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_check_constraint_rejects_all_three_targets_at_once():
    engine = _memory_engine()
    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(),
                user_id=uuid.uuid4(),
                department_id=uuid.uuid4(),
                location_id=uuid.uuid4(),
                director_user_id=uuid.uuid4(),
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_check_constraint_accepts_department_only():
    engine = _memory_engine()
    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=uuid.uuid4(), department_id=uuid.uuid4()
            )
        )
        session.commit()
        assert session.query(UserScopeAssignment).count() == 1


def test_check_constraint_accepts_director_only():
    engine = _memory_engine()
    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=uuid.uuid4(), director_user_id=uuid.uuid4()
            )
        )
        session.commit()
        assert session.query(UserScopeAssignment).count() == 1


# ---------------------------------------------------------------------------
# Uniqueness across nullable target columns (task 3.4b).
#
# A plain multi-column UNIQUE constraint on
# (user_id, department_id, location_id, director_user_id) does NOT reject a
# duplicate (user_id, department_id) row (or the location/director
# equivalents), because the CHECK constraint forces the other two target
# columns to be NULL on both rows and ANSI SQL treats NULL <> NULL for
# uniqueness purposes. This was proven by a since-removed test
# (`test_unique_constraint_known_gap_null_padded_duplicate_is_not_rejected`,
# see git history / apply-progress.md for the original finding). The fix is
# three partial unique indexes, one per target column, each active only
# where that column IS NOT NULL -- the standard Postgres pattern for
# "unique across nullable columns". These tests now prove duplicates ARE
# rejected for each of the three target shapes.
# ---------------------------------------------------------------------------


def test_duplicate_department_assignment_is_rejected():
    engine = _memory_engine()
    user_id = uuid.uuid4()
    department_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=user_id, department_id=department_id
            )
        )
        session.commit()

    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=user_id, department_id=department_id
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_duplicate_location_assignment_is_rejected():
    engine = _memory_engine()
    user_id = uuid.uuid4()
    location_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=user_id, location_id=location_id
            )
        )
        session.commit()

    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=user_id, location_id=location_id
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_duplicate_director_assignment_is_rejected():
    engine = _memory_engine()
    user_id = uuid.uuid4()
    director_user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=user_id, director_user_id=director_user_id
            )
        )
        session.commit()

    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=user_id, director_user_id=director_user_id
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_same_user_can_have_department_and_director_assignment_together():
    # Different target columns for the same user must NOT collide -- each
    # partial index only covers its own column.
    engine = _memory_engine()
    user_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=user_id, department_id=uuid.uuid4()
            )
        )
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=user_id, director_user_id=uuid.uuid4()
            )
        )
        session.commit()
        assert session.query(UserScopeAssignment).count() == 2


def test_different_users_can_share_the_same_department_assignment():
    engine = _memory_engine()
    department_id = uuid.uuid4()
    with Session(engine) as session:
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=uuid.uuid4(), department_id=department_id
            )
        )
        session.add(
            UserScopeAssignment(
                id=uuid.uuid4(), user_id=uuid.uuid4(), department_id=department_id
            )
        )
        session.commit()
        assert session.query(UserScopeAssignment).count() == 2


def test_no_plain_multicolumn_unique_constraint_remains():
    # The broken uq_user_scope_assignments_triple UNIQUE constraint must be
    # gone -- replaced entirely by the three partial unique indexes below.
    constraint_names = {
        constraint.name
        for constraint in UserScopeAssignment.__table__.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    }
    assert "uq_user_scope_assignments_triple" not in constraint_names


def test_three_partial_unique_indexes_are_defined():
    index_names = {index.name for index in UserScopeAssignment.__table__.indexes}
    assert {
        "uq_user_scope_assignments_department",
        "uq_user_scope_assignments_location",
        "uq_user_scope_assignments_director",
    }.issubset(index_names)


# ---------------------------------------------------------------------------
# D3 reclassification ladder (pure function, unit-testable without a DB)
# ---------------------------------------------------------------------------


def test_reclassification_ladder_rung1_surviving_role_name_coordinador():
    migration = _load_split_migration()

    result = migration.resolve_reclassification(
        legacy_role_name="coordinador", position_canonical_role=None
    )

    assert result == {"new_role": "COORDINADOR", "rung": 1, "ambiguous": False}


def test_reclassification_ladder_rung1_surviving_role_name_secretaria():
    migration = _load_split_migration()

    result = migration.resolve_reclassification(
        legacy_role_name="secretaria", position_canonical_role="COORDINADOR"
    )

    # Rung 1 takes precedence over rung 2 even when both signals are present.
    assert result == {"new_role": "SECRETARIA", "rung": 1, "ambiguous": False}


def test_reclassification_ladder_rung2_position_canonical_role():
    migration = _load_split_migration()

    result = migration.resolve_reclassification(
        legacy_role_name=None, position_canonical_role="SECRETARIA"
    )

    assert result == {"new_role": "SECRETARIA", "rung": 2, "ambiguous": False}


def test_reclassification_ladder_rung3_fallback_unscoped_coordinador_is_audited():
    migration = _load_split_migration()

    result = migration.resolve_reclassification(
        legacy_role_name=None, position_canonical_role=None
    )

    assert result == {"new_role": "COORDINADOR", "rung": 3, "ambiguous": True}


def test_reclassification_ladder_rung3_when_signals_are_unrecognized():
    migration = _load_split_migration()

    result = migration.resolve_reclassification(
        legacy_role_name="some_unmapped_legacy_name",
        position_canonical_role="CATEDRATICO",
    )

    # Neither signal disambiguates COORDINADOR vs SECRETARIA -> rung 3.
    assert result == {"new_role": "COORDINADOR", "rung": 3, "ambiguous": True}
