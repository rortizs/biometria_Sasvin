"""Tests for task 3.12's deferred CATEDRATICO self-check-in slice.

Real gap this closes: `check_in`/`check_out` (`POST /attendance/check-in`,
`POST /attendance/check-out`) are the shared face-recognition kiosk flow
and stay intentionally reachable without authentication ("No requiere
autenticacion. El rostro en las imagenes es la credencial."). The spec's
"CATEDRATICO marks own attendance" scenario (attendance-access-control,
"Teacher Attendance Scope") requires an *authenticated* CATEDRATICO actor
to be denied when the face-matched employee is not their own. Since the
frontend's global auth interceptor attaches a Bearer token to every
outgoing request whenever the caller's browser already has an active
session -- even on the guardless `/kiosk`/`/attendance` routes -- a
CATEDRATICO logged into their own dashboard session and using the kiosk
device is a real, reachable case, not a hypothetical.

This is implemented as an *optional*-auth guard
(`get_optional_current_user` in `app.api.deps`) rather than a hard
`require_permission("attendance.mark.self")` gate: the endpoint keeps
accepting anonymous callers exactly as before (regression-locked below),
and only enforces self-scope when an authenticated actor is present AND
that actor holds CATEDRATICO. Other authenticated roles (e.g. an admin
supervising the shared kiosk device while logged in) are unaffected --
this matches design.md's Corrected Role Matrix, which scopes only
CATEDRATICO's own attendance, not every authenticated actor.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.deps import get_optional_current_user
from app.api.v1.endpoints.attendance import check_in, check_out
from app.models.attendance import AttendanceRecord
from app.models.employee import Employee
from app.models.location import Location
from app.schemas.attendance import AttendanceCheckIn, AttendanceCheckOut


THREE_IMAGES = ["base64img1", "base64img2", "base64img3"]


def _user(role: str, employee_id=None, is_active: bool = True) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        email=f"{role.lower()}@example.com",
        role=role,
        employee_id=employee_id,
        user_roles=[],
        is_active=is_active,
    )


def _request(authorization: str | None) -> MagicMock:
    request = MagicMock(spec=Request)
    request.headers = {"Authorization": authorization} if authorization else {}
    return request


def mock_db_execute_result(return_values: list):
    results = []
    for value in return_values:
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = value
        results.append(mock_result)
    return results


@pytest.fixture
def mock_db():
    mock = AsyncMock(spec=AsyncSession)
    mock.add = MagicMock()
    mock.commit = AsyncMock()

    async def mock_refresh(obj):
        if not hasattr(obj, "id") or obj.id is None:
            obj.id = uuid4()

    mock.refresh = AsyncMock(side_effect=mock_refresh)
    return mock


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
    location.latitude = -34.603722
    location.longitude = -58.381592
    location.radius_meters = 100.0
    return location


@pytest.fixture
def mock_attendance_record(mock_employee):
    record = MagicMock(spec=AttendanceRecord)
    record.id = uuid4()
    record.employee_id = mock_employee.id
    record.check_in = None
    record.check_out = None
    record.status = "absent"
    record.geo_validated = False
    return record


def _mock_face_service(mock_fr, employee):
    mock_face_service = mock_fr.return_value
    mock_face_service.get_face_embedding.return_value = [0.1, 0.2, 0.3]
    mock_face_service.check_liveness_from_embeddings.return_value = (True, 0.01)
    mock_face_service.find_best_match = AsyncMock(return_value=(employee, 0.95))
    return mock_face_service


# ==================== get_optional_current_user ====================


@pytest.mark.asyncio
async def test_get_optional_current_user_returns_none_without_header():
    db = AsyncMock(spec=AsyncSession)
    result = await get_optional_current_user(_request(None), db)
    assert result is None
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_get_optional_current_user_returns_none_for_non_bearer_scheme():
    db = AsyncMock(spec=AsyncSession)
    result = await get_optional_current_user(_request("Basic abc123"), db)
    assert result is None
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_get_optional_current_user_returns_none_for_invalid_token():
    db = AsyncMock(spec=AsyncSession)
    with patch("app.api.deps.decode_token", return_value=None):
        result = await get_optional_current_user(_request("Bearer bad-token"), db)
    assert result is None
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_get_optional_current_user_returns_none_for_refresh_token():
    db = AsyncMock(spec=AsyncSession)
    with patch(
        "app.api.deps.decode_token",
        return_value={"sub": str(uuid4()), "type": "refresh"},
    ):
        result = await get_optional_current_user(_request("Bearer refresh-token"), db)
    assert result is None
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_get_optional_current_user_returns_none_for_unknown_or_inactive_user():
    db = AsyncMock(spec=AsyncSession)
    db.execute = AsyncMock(side_effect=mock_db_execute_result([None]))
    with patch(
        "app.api.deps.decode_token",
        return_value={"sub": str(uuid4()), "type": "access"},
    ):
        result = await get_optional_current_user(_request("Bearer good-token"), db)
    assert result is None


@pytest.mark.asyncio
async def test_get_optional_current_user_returns_active_user_for_valid_token():
    db = AsyncMock(spec=AsyncSession)
    actor = _user("CATEDRATICO")
    db.execute = AsyncMock(side_effect=mock_db_execute_result([actor]))
    with patch(
        "app.api.deps.decode_token",
        return_value={"sub": str(actor.id), "type": "access"},
    ):
        result = await get_optional_current_user(_request("Bearer good-token"), db)
    assert result is actor


# ==================== check_in: self-scope enforcement ====================


@pytest.mark.asyncio
async def test_checkin_anonymous_caller_is_unaffected(mock_db, mock_employee, mock_location):
    """Regression lock: no Authorization header -> unchanged kiosk behavior."""
    request = AttendanceCheckIn(images=THREE_IMAGES, latitude=-34.603722, longitude=-58.381592)

    with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
        _mock_face_service(mock_fr, mock_employee)
        mock_db.execute = AsyncMock(side_effect=mock_db_execute_result([None, mock_location]))

        response = await check_in(mock_db, request, current_user=None)

        assert response.employee_id == mock_employee.id


@pytest.mark.asyncio
async def test_checkin_catedratico_own_employee_is_allowed(mock_db, mock_employee, mock_location):
    request = AttendanceCheckIn(images=THREE_IMAGES, latitude=-34.603722, longitude=-58.381592)
    actor = _user("CATEDRATICO", employee_id=mock_employee.id)

    with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
        _mock_face_service(mock_fr, mock_employee)
        mock_db.execute = AsyncMock(side_effect=mock_db_execute_result([None, mock_location]))

        response = await check_in(mock_db, request, current_user=actor)

        assert response.employee_id == mock_employee.id


@pytest.mark.asyncio
async def test_checkin_catedratico_other_employee_is_denied(mock_db, mock_employee, mock_location):
    request = AttendanceCheckIn(images=THREE_IMAGES, latitude=-34.603722, longitude=-58.381592)
    actor = _user("CATEDRATICO", employee_id=uuid4())  # different from mock_employee.id

    with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
        _mock_face_service(mock_fr, mock_employee)

        with pytest.raises(HTTPException) as exc_info:
            await check_in(mock_db, request, current_user=actor)

        assert exc_info.value.status_code == 403
        mock_db.add.assert_not_called()
        mock_db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_checkin_other_authenticated_role_is_unaffected(mock_db, mock_employee, mock_location):
    """A DECANO supervising the shared kiosk device is not scoped -- only
    CATEDRATICO is restricted to its own employee identity."""
    request = AttendanceCheckIn(images=THREE_IMAGES, latitude=-34.603722, longitude=-58.381592)
    actor = _user("DECANO", employee_id=uuid4())

    with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
        _mock_face_service(mock_fr, mock_employee)
        mock_db.execute = AsyncMock(side_effect=mock_db_execute_result([None, mock_location]))

        response = await check_in(mock_db, request, current_user=actor)

        assert response.employee_id == mock_employee.id


# ==================== check_out: self-scope enforcement ====================


@pytest.mark.asyncio
async def test_checkout_anonymous_caller_is_unaffected(
    mock_db, mock_employee, mock_location, mock_attendance_record
):
    request = AttendanceCheckOut(images=THREE_IMAGES, latitude=-34.603722, longitude=-58.381592)
    mock_attendance_record.check_in = MagicMock()
    mock_attendance_record.geo_validated = True

    with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
        _mock_face_service(mock_fr, mock_employee)
        mock_db.execute = AsyncMock(
            side_effect=mock_db_execute_result([mock_attendance_record, mock_location])
        )

        response = await check_out(mock_db, request, current_user=None)

        assert response.employee_id == mock_employee.id


@pytest.mark.asyncio
async def test_checkout_catedratico_own_employee_is_allowed(
    mock_db, mock_employee, mock_location, mock_attendance_record
):
    request = AttendanceCheckOut(images=THREE_IMAGES, latitude=-34.603722, longitude=-58.381592)
    actor = _user("CATEDRATICO", employee_id=mock_employee.id)
    mock_attendance_record.check_in = MagicMock()
    mock_attendance_record.geo_validated = True

    with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
        _mock_face_service(mock_fr, mock_employee)
        mock_db.execute = AsyncMock(
            side_effect=mock_db_execute_result([mock_attendance_record, mock_location])
        )

        response = await check_out(mock_db, request, current_user=actor)

        assert response.employee_id == mock_employee.id


@pytest.mark.asyncio
async def test_checkout_catedratico_other_employee_is_denied(mock_db, mock_employee):
    request = AttendanceCheckOut(images=THREE_IMAGES, latitude=-34.603722, longitude=-58.381592)
    actor = _user("CATEDRATICO", employee_id=uuid4())

    with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
        _mock_face_service(mock_fr, mock_employee)

        with pytest.raises(HTTPException) as exc_info:
            await check_out(mock_db, request, current_user=actor)

        assert exc_info.value.status_code == 403
        mock_db.commit.assert_not_called()
