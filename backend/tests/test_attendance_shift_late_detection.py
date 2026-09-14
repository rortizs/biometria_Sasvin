"""
Unit tests for shift-aware late detection on check-in (BUG-06).

`check_in()` previously set `status = "present"` unconditionally, with zero
comparison against the employee's assigned shift (`EmployeeSchedule` ->
`Schedule`). These tests pin the fix: check-ins after
`check_in_time + tolerance_minutes` (Guatemala local time) are marked
`status = "late"`; check-ins within tolerance, or employees with no
`EmployeeSchedule` row for today, keep `status = "present"`.

Scope: only the day-of-week default pattern (`EmployeeSchedule` -> `Schedule`)
is resolved here. `ScheduleAssignment` per-date overrides and
`ScheduleException` (vacation/day-off/holiday) records are a deferred,
separate refinement (see `_resolve_shift_check_in_time` call site).
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import date, datetime, time
from uuid import uuid4

from app.api.v1.endpoints.attendance import check_in
from app.schemas.attendance import AttendanceCheckIn
from app.models.employee import Employee
from app.models.location import Location
from app.models.schedule import Schedule

from tests.test_attendance_endpoints import (
    THREE_IMAGES,
    allow_liveness,
    mock_db_execute_result,
)


FIXED_TODAY = date(2026, 1, 15)  # Thursday
LOCATION_LAT = -34.603722
LOCATION_LON = -58.381592


def _patched_datetime(fixed_utc_now: datetime):
    """Patch `attendance.datetime` so `.utcnow()` is fixed while `.combine`
    and other static methods keep behaving like the real `datetime` class."""
    mock_dt = MagicMock(wraps=datetime)
    mock_dt.utcnow.return_value = fixed_utc_now
    mock_dt.combine = datetime.combine
    return mock_dt


@pytest.fixture
def mock_employee():
    employee = MagicMock(spec=Employee)
    employee.id = uuid4()
    employee.full_name = "Juan Pérez"
    employee.location_id = uuid4()
    return employee


@pytest.fixture
def mock_location():
    location = MagicMock(spec=Location)
    location.id = uuid4()
    location.name = "Sede Central"
    location.latitude = LOCATION_LAT
    location.longitude = LOCATION_LON
    location.radius_meters = 100.0
    return location


@pytest.fixture
def mock_schedule():
    schedule = MagicMock(spec=Schedule)
    schedule.id = uuid4()
    schedule.check_in_time = time(8, 0)
    schedule.tolerance_minutes = 15
    return schedule


@pytest.fixture
def mock_db():
    mock = AsyncMock()
    mock.add = MagicMock()
    mock.commit = AsyncMock()

    async def mock_refresh(obj):
        if not hasattr(obj, "id") or obj.id is None:
            obj.id = uuid4()

    mock.refresh = AsyncMock(side_effect=mock_refresh)
    return mock


async def _run_check_in(mock_db, mock_employee, mock_location, mock_schedule, fixed_utc_now):
    request = AttendanceCheckIn(
        images=THREE_IMAGES,
        latitude=LOCATION_LAT,
        longitude=LOCATION_LON,
    )

    with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr, \
        patch(
            "app.api.v1.endpoints.attendance.datetime",
            _patched_datetime(fixed_utc_now),
        ), patch(
            "app.api.v1.endpoints.attendance.date"
        ) as mock_date:
        mock_date.today.return_value = FIXED_TODAY

        mock_face_service = mock_fr.return_value
        mock_face_service.get_face_embedding.return_value = [0.1, 0.2, 0.3]
        allow_liveness(mock_face_service)
        mock_face_service.find_best_match = AsyncMock(
            return_value=(mock_employee, 0.95)
        )

        # 1) existing-attendance-today lookup -> None (fresh check-in)
        # 2) geo/location lookup -> mock_location (within radius)
        # 3) shift lookup -> mock_schedule or None
        mock_db.execute = AsyncMock(
            side_effect=mock_db_execute_result([None, mock_location, mock_schedule])
        )

        return await check_in(mock_db, request)


class TestBug06ShiftLateDetection:
    @pytest.mark.asyncio
    async def test_checkin_within_tolerance_stays_present(
        self, mock_db, mock_employee, mock_location, mock_schedule
    ):
        """08:00 shift + 15min tolerance; check in at 08:10 Guatemala local
        (14:10 UTC naive) must stay 'present'."""
        fixed_utc_now = datetime(2026, 1, 15, 14, 10)

        response = await _run_check_in(
            mock_db, mock_employee, mock_location, mock_schedule, fixed_utc_now
        )

        assert response.status == "present"

    @pytest.mark.asyncio
    async def test_checkin_after_tolerance_is_marked_late(
        self, mock_db, mock_employee, mock_location, mock_schedule
    ):
        """08:00 shift + 15min tolerance; check in at 08:20 Guatemala local
        (14:20 UTC naive) must become 'late' with a note in the message."""
        fixed_utc_now = datetime(2026, 1, 15, 14, 20)

        response = await _run_check_in(
            mock_db, mock_employee, mock_location, mock_schedule, fixed_utc_now
        )

        assert response.status == "late"
        assert "tardía" in response.message

    @pytest.mark.asyncio
    async def test_checkin_without_employee_schedule_stays_present(
        self, mock_db, mock_employee, mock_location
    ):
        """No EmployeeSchedule row for today's day-of-week -> unchanged
        behavior, status stays 'present' (regression guard)."""
        fixed_utc_now = datetime(2026, 1, 15, 14, 20)

        response = await _run_check_in(
            mock_db, mock_employee, mock_location, None, fixed_utc_now
        )

        assert response.status == "present"

    @pytest.mark.asyncio
    async def test_checkin_exactly_at_tolerance_boundary_stays_present(
        self, mock_db, mock_employee, mock_location, mock_schedule
    ):
        """Boundary choice: check in exactly at 08:15 Guatemala local
        (14:15 UTC naive, i.e. exactly check_in_time + tolerance_minutes)
        stays 'present' -- the comparison is strictly-greater-than (`>`),
        not `>=`, so the exact cutoff instant is not late."""
        fixed_utc_now = datetime(2026, 1, 15, 14, 15)

        response = await _run_check_in(
            mock_db, mock_employee, mock_location, mock_schedule, fixed_utc_now
        )

        assert response.status == "present"
