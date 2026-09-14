"""
Unit tests for schedule exception type coverage (BUG-05).

Frontend `ExceptionType` (frontend/src/app/core/models/schedule.model.ts)
offers 13 exception types. Backend previously only accepted 6, causing
`POST /schedules/exceptions` to return 422 for the other 7. These tests
pin the fix: all 13 frontend types must be accepted by both the Pydantic
schema and the SQLAlchemy model enum.
"""

import pytest

from app.schemas.schedule import ScheduleExceptionCreate, ExceptionTypeEnum
from app.models.schedule import ExceptionType

# Full set of 13 exception types the frontend offers (frontend source of
# truth: schedule.model.ts ExceptionType).
ALL_FRONTEND_EXCEPTION_TYPES = [
    "vacation",
    "sick_leave",
    "bereavement",
    "medical_permission",
    "work_letter",
    "compensatory",
    "maternity_leave",
    "paternity_leave",
    "personal_day",
    "holiday",
    "day_off",
    "permission",
    "other",
]


class TestBug05ExceptionTypeParity:
    """All 13 frontend exception types must be accepted by the backend."""

    @pytest.mark.parametrize("exception_type", ALL_FRONTEND_EXCEPTION_TYPES)
    def test_schema_accepts_all_frontend_exception_types(self, exception_type):
        schema = ScheduleExceptionCreate(
            exception_type=exception_type,
            start_date="2026-01-01",
            end_date="2026-01-01",
        )

        assert schema.exception_type == exception_type

    @pytest.mark.parametrize("exception_type", ALL_FRONTEND_EXCEPTION_TYPES)
    def test_schema_enum_has_all_frontend_exception_types(self, exception_type):
        assert ExceptionTypeEnum(exception_type).value == exception_type

    @pytest.mark.parametrize("exception_type", ALL_FRONTEND_EXCEPTION_TYPES)
    def test_model_enum_has_all_frontend_exception_types(self, exception_type):
        assert ExceptionType(exception_type).value == exception_type

    def test_schema_enum_has_exactly_13_members(self):
        assert len(list(ExceptionTypeEnum)) == 13

    def test_model_enum_has_exactly_13_members(self):
        assert len(list(ExceptionType)) == 13
