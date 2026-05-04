"""
Unit tests for attendance endpoints - check_in/check_out with images[] array.

Tests cover:
- Successful check-in/check-out with multiple images
- Backward compatibility with single image field
- Face recognition mock responses
- GPS validation scenarios
- Error responses (400, 404, 422)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import date, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.attendance import (
    check_in,
    check_out,
    list_attendance,
    list_today_attendance,
)
from app.schemas.attendance import AttendanceCheckIn, AttendanceCheckOut
from app.models.employee import Employee
from app.models.location import Location
from app.models.attendance import AttendanceRecord


def mock_db_execute_result(return_values: list):
    """
    Helper to mock db.execute() with multiple queries.

    Args:
        return_values: List of values to return from scalar_one_or_none() calls

    Returns:
        Side effect list for mock_db.execute
    """
    results = []
    for value in return_values:
        mock_result = MagicMock()
        # scalar_one_or_none() is a sync method that returns the value directly in SQLAlchemy 2.0 async
        mock_result.scalar_one_or_none.return_value = value
        results.append(mock_result)
    return results


def mock_db_execute_scalars_all(records: list):
    """Helper to mock db.execute() for list queries using scalars().all()."""
    mock_result = MagicMock()
    mock_scalars = MagicMock()
    mock_scalars.all.return_value = records
    mock_result.scalars.return_value = mock_scalars
    return mock_result


@pytest.fixture
def mock_db():
    """Create mock async database session."""
    mock = AsyncMock(spec=AsyncSession)

    # Mock common db methods
    mock.add = MagicMock()
    mock.commit = AsyncMock()

    # Mock refresh to set ID if not present
    async def mock_refresh(obj):
        if not hasattr(obj, "id") or obj.id is None:
            obj.id = uuid4()

    mock.refresh = AsyncMock(side_effect=mock_refresh)

    return mock


@pytest.fixture
def mock_employee():
    """Create mock employee."""
    employee = MagicMock(spec=Employee)
    employee.id = uuid4()
    employee.full_name = "Juan Pérez"
    employee.location_id = uuid4()
    return employee


@pytest.fixture
def mock_location():
    """Create mock location."""
    location = MagicMock(spec=Location)
    location.id = uuid4()
    location.name = "Sede Central"
    location.latitude = -34.603722
    location.longitude = -58.381592
    location.radius_meters = 100.0
    return location


@pytest.fixture
def mock_attendance_record(mock_employee):
    """Create mock attendance record."""
    record = MagicMock(spec=AttendanceRecord)
    record.id = uuid4()
    record.employee_id = mock_employee.id
    record.record_date = date.today()
    record.check_in = None
    record.check_out = None
    record.status = "absent"
    record.check_in_confidence = None
    record.check_out_confidence = None
    record.check_in_latitude = None
    record.check_in_longitude = None
    record.check_in_distance_meters = None
    record.check_out_latitude = None
    record.check_out_longitude = None
    record.check_out_distance_meters = None
    record.geo_validated = False
    return record


class TestCheckInEndpoint:
    """Test /check-in endpoint."""

    @pytest.mark.asyncio
    async def test_successful_checkin_with_multiple_images(
        self, mock_db, mock_employee, mock_location, mock_attendance_record
    ):
        """Should process check-in with 3 images successfully."""
        # Arrange
        request = AttendanceCheckIn(
            images=["base64img1", "base64img2", "base64img3"],
            latitude=-34.603722,
            longitude=-58.381592,
        )

        # Mock face recognition service
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.return_value = [
                0.1,
                0.2,
                0.3,
            ]  # Mock embedding
            mock_face_service.find_best_match = AsyncMock(
                return_value=(mock_employee, 0.95)
            )

            # Mock database queries
            mock_db.execute = AsyncMock(
                side_effect=mock_db_execute_result([None, mock_location])
            )

            # Act
            response = await check_in(mock_db, request)

            # Assert
            assert response.employee_id == mock_employee.id
            assert response.employee_name == "Juan Pérez"
            assert response.confidence == 0.95
            assert response.geo_validated is True  # Within radius
            assert response.distance_meters is not None

            # Verify first image was used for face recognition
            mock_face_service.get_face_embedding.assert_called_once_with("base64img1")

    @pytest.mark.asyncio
    async def test_backward_compat_single_image_field(
        self, mock_db, mock_employee, mock_location
    ):
        """Should accept deprecated 'image' field and wrap to images array."""
        # Arrange
        request = AttendanceCheckIn(
            image="base64img1",  # Old API
            latitude=-34.603722,
            longitude=-58.381592,
        )

        # Mock face recognition
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.return_value = [0.1, 0.2, 0.3]
            mock_face_service.find_best_match = AsyncMock(
                return_value=(mock_employee, 0.95)
            )

            # Mock database
            mock_db.execute = AsyncMock(
                side_effect=mock_db_execute_result([None, mock_location])
            )

            # Act
            response = await check_in(mock_db, request)

            # Assert
            assert response.confidence == 0.95
            # Verify first (and only) image was used
            mock_face_service.get_face_embedding.assert_called_once_with("base64img1")

    @pytest.mark.asyncio
    async def test_reject_no_face_detected(self, mock_db):
        """Should return 400 if no face detected in image."""
        # Arrange
        request = AttendanceCheckIn(
            images=["base64img_no_face"],
        )

        # Mock face recognition - no face detected
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.return_value = None  # No face

            # Act & Assert
            with pytest.raises(HTTPException) as exc_info:
                await check_in(mock_db, request)

            assert exc_info.value.status_code == 400
            assert "No face detected" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_reject_face_not_recognized(self, mock_db):
        """Should return 404 if face not in database."""
        # Arrange
        request = AttendanceCheckIn(
            images=["base64img_unknown"],
        )

        # Mock face recognition - unknown face
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.return_value = [0.1, 0.2, 0.3]
            mock_face_service.find_best_match = AsyncMock(return_value=None)  # No match

            # Act & Assert
            with pytest.raises(HTTPException) as exc_info:
                await check_in(mock_db, request)

            assert exc_info.value.status_code == 404
            assert "No matching employee found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_reject_image_processing_error(self, mock_db):
        """Should return 400 if image processing fails."""
        # Arrange
        request = AttendanceCheckIn(
            images=["invalid_base64"],
        )

        # Mock face recognition - processing error
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.side_effect = Exception(
                "Invalid image format"
            )

            # Act & Assert
            with pytest.raises(HTTPException) as exc_info:
                await check_in(mock_db, request)

            assert exc_info.value.status_code == 400
            assert "Error processing image" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_checkin_without_gps_coordinates_is_rejected(
        self, mock_db, mock_employee, mock_location
    ):
        """Should reject check-in when GPS coordinates are missing."""
        # Arrange
        request = AttendanceCheckIn(
            images=["base64img1"],
            # No latitude/longitude
        )

        # Mock face recognition
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.return_value = [0.1, 0.2, 0.3]
            mock_face_service.find_best_match = AsyncMock(
                return_value=(mock_employee, 0.95)
            )

            # Mock database
            mock_db.execute = AsyncMock(side_effect=mock_db_execute_result([None]))

            # Act
            with pytest.raises(HTTPException) as exc_info:
                await check_in(mock_db, request)

            # Assert
            assert exc_info.value.status_code == 400
            assert "GPS" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_checkin_outside_permitted_area_is_rejected(
        self, mock_db, mock_employee, mock_location
    ):
        """Should reject check-in if employee is outside permitted radius."""
        # Arrange - coordinates far from location
        request = AttendanceCheckIn(
            images=["base64img1"],
            latitude=-34.70,  # Far from -34.603722
            longitude=-58.50,  # Far from -58.381592
        )

        # Mock face recognition
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.return_value = [0.1, 0.2, 0.3]
            mock_face_service.find_best_match = AsyncMock(
                return_value=(mock_employee, 0.95)
            )

            # Mock database
            mock_db.execute = AsyncMock(
                side_effect=mock_db_execute_result([None, mock_location])
            )

            # Act
            with pytest.raises(HTTPException) as exc_info:
                await check_in(mock_db, request)

            # Assert
            assert exc_info.value.status_code == 403
            assert "Outside permitted area" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_already_checked_in_today(
        self, mock_db, mock_employee, mock_location, mock_attendance_record
    ):
        """Should return existing record if already checked in."""
        # Arrange
        request = AttendanceCheckIn(
            images=["base64img1"],
        )

        # Set existing check-in
        mock_attendance_record.check_in = datetime.utcnow()
        mock_attendance_record.status = "present"
        mock_attendance_record.check_in_confidence = 0.93
        mock_attendance_record.geo_validated = True
        mock_attendance_record.check_in_distance_meters = 50.0

        # Mock face recognition
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.return_value = [0.1, 0.2, 0.3]
            mock_face_service.find_best_match = AsyncMock(
                return_value=(mock_employee, 0.95)
            )

            # Mock database - existing record found
            # No GPS coordinates, so _validate_geo doesn't call db.execute
            # Only the attendance record query is executed
            mock_db.execute = AsyncMock(
                side_effect=mock_db_execute_result([mock_attendance_record])
            )

            # Act
            response = await check_in(mock_db, request)

            # Assert
            assert "Already checked in" in response.message
            assert response.check_in == mock_attendance_record.check_in


class TestCheckOutEndpoint:
    """Test /check-out endpoint."""

    @pytest.mark.asyncio
    async def test_successful_checkout_with_multiple_images(
        self, mock_db, mock_employee, mock_location, mock_attendance_record
    ):
        """Should process check-out with 3 images successfully."""
        # Arrange
        request = AttendanceCheckOut(
            images=["base64img1", "base64img2", "base64img3"],
            latitude=-34.603722,
            longitude=-58.381592,
        )

        # Set existing check-in
        mock_attendance_record.check_in = datetime.utcnow()
        mock_attendance_record.geo_validated = True

        # Mock face recognition
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.return_value = [0.1, 0.2, 0.3]
            mock_face_service.find_best_match = AsyncMock(
                return_value=(mock_employee, 0.95)
            )

            # Mock database
            mock_db.execute = AsyncMock(
                side_effect=mock_db_execute_result(
                    [mock_attendance_record, mock_location]
                )
            )

            # Act
            response = await check_out(mock_db, request)

            # Assert
            assert response.employee_id == mock_employee.id
            assert response.confidence == 0.95
            assert response.check_out is not None

            # Verify first image was used
            mock_face_service.get_face_embedding.assert_called_once_with("base64img1")

    @pytest.mark.asyncio
    async def test_reject_checkout_without_checkin(
        self, mock_db, mock_employee, mock_location
    ):
        """Should return 400 if no check-in found."""
        # Arrange
        request = AttendanceCheckOut(
            images=["base64img1"],
        )

        # Mock face recognition
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.return_value = [0.1, 0.2, 0.3]
            mock_face_service.find_best_match = AsyncMock(
                return_value=(mock_employee, 0.95)
            )

            # Mock database - no existing record
            # No GPS coordinates, so _validate_geo doesn't call db.execute
            # Only the attendance record query is executed
            mock_db.execute = AsyncMock(side_effect=mock_db_execute_result([None]))

            # Act & Assert
            with pytest.raises(HTTPException) as exc_info:
                await check_out(mock_db, request)

            assert exc_info.value.status_code == 400
            assert "No check-in record found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_already_checked_out_today(
        self, mock_db, mock_employee, mock_location, mock_attendance_record
    ):
        """Should return existing record if already checked out."""
        # Arrange
        request = AttendanceCheckOut(
            images=["base64img1"],
        )

        # Set existing check-in and check-out
        mock_attendance_record.check_in = datetime.utcnow()
        mock_attendance_record.check_out = datetime.utcnow()
        mock_attendance_record.check_out_distance_meters = 50.0

        # Mock face recognition
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.return_value = [0.1, 0.2, 0.3]
            mock_face_service.find_best_match = AsyncMock(
                return_value=(mock_employee, 0.95)
            )

            # Mock database
            # No GPS coordinates, so _validate_geo doesn't call db.execute
            # Only the attendance record query is executed
            mock_db.execute = AsyncMock(
                side_effect=mock_db_execute_result([mock_attendance_record])
            )

            # Act
            response = await check_out(mock_db, request)

            # Assert
            assert "Already checked out" in response.message
            assert response.check_out == mock_attendance_record.check_out

    @pytest.mark.asyncio
    async def test_checkout_outside_radius_is_rejected(
        self, mock_db, mock_employee, mock_location, mock_attendance_record
    ):
        """Should reject check-out if employee is outside permitted radius."""
        # Arrange
        request = AttendanceCheckOut(
            images=["base64img1"],
            latitude=-34.70,  # Far from location
            longitude=-58.50,
        )

        # Check-in was valid
        mock_attendance_record.check_in = datetime.utcnow()
        mock_attendance_record.geo_validated = True

        # Mock face recognition
        with patch("app.api.v1.endpoints.attendance.FaceRecognitionService") as mock_fr:
            mock_face_service = mock_fr.return_value
            mock_face_service.get_face_embedding.return_value = [0.1, 0.2, 0.3]
            mock_face_service.find_best_match = AsyncMock(
                return_value=(mock_employee, 0.95)
            )

            # Mock database
            mock_db.execute = AsyncMock(
                side_effect=mock_db_execute_result(
                    [mock_attendance_record, mock_location]
                )
            )

            # Act
            with pytest.raises(HTTPException) as exc_info:
                await check_out(mock_db, request)

            # Assert
            assert exc_info.value.status_code == 403
            assert "Outside permitted area" in exc_info.value.detail


class TestAttendanceListEndpoints:
    """Test attendance list/report endpoints."""

    @pytest.mark.asyncio
    async def test_list_attendance_includes_geolocation_fields(
        self, mock_db, mock_attendance_record
    ):
        """Should include stored geolocation coordinates and distances in reports."""
        mock_attendance_record.employee = MagicMock(full_name="Juan Pérez")
        mock_attendance_record.check_in_latitude = 14.2971
        mock_attendance_record.check_in_longitude = -89.8956
        mock_attendance_record.check_in_distance_meters = 12.5
        mock_attendance_record.check_out_latitude = 14.2973
        mock_attendance_record.check_out_longitude = -89.8952
        mock_attendance_record.check_out_distance_meters = 15.2
        mock_attendance_record.created_at = datetime.utcnow()

        mock_db.execute = AsyncMock(
            return_value=mock_db_execute_scalars_all([mock_attendance_record])
        )

        response = await list_attendance(mock_db, MagicMock(), skip=0, limit=100)

        assert len(response) == 1
        assert response[0].employee_name == "Juan Pérez"
        assert response[0].check_in_latitude == 14.2971
        assert response[0].check_in_longitude == -89.8956
        assert response[0].check_in_distance_meters == 12.5
        assert response[0].check_out_latitude == 14.2973
        assert response[0].check_out_longitude == -89.8952
        assert response[0].check_out_distance_meters == 15.2

    @pytest.mark.asyncio
    async def test_list_today_attendance_includes_geolocation_fields(
        self, mock_db, mock_attendance_record
    ):
        """Should include geolocation fields in dashboard live view."""
        mock_attendance_record.employee = MagicMock(full_name="Juan Pérez")
        mock_attendance_record.check_in_latitude = 14.2971
        mock_attendance_record.check_in_longitude = -89.8956
        mock_attendance_record.check_in_distance_meters = 12.5
        mock_attendance_record.check_out_latitude = None
        mock_attendance_record.check_out_longitude = None
        mock_attendance_record.check_out_distance_meters = None
        mock_attendance_record.created_at = datetime.utcnow()

        mock_db.execute = AsyncMock(
            return_value=mock_db_execute_scalars_all([mock_attendance_record])
        )

        response = await list_today_attendance(mock_db, MagicMock())

        assert len(response) == 1
        assert response[0].employee_name == "Juan Pérez"
        assert response[0].check_in_latitude == 14.2971
        assert response[0].check_in_longitude == -89.8956
        assert response[0].check_in_distance_meters == 12.5
