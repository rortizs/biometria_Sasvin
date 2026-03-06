"""
Unit tests for attendance schemas - images[] validation and backward compatibility.
"""

import pytest
from pydantic import ValidationError
from app.schemas.attendance import AttendanceCheckIn, AttendanceCheckOut


class TestAttendanceCheckInSchema:
    """Test AttendanceCheckIn schema validation."""

    def test_valid_schema_with_images_array(self):
        """Should accept images array."""
        data = {
            "images": ["base64image1", "base64image2", "base64image3"],
            "latitude": -34.603722,
            "longitude": -58.381592,
        }

        schema = AttendanceCheckIn(**data)

        assert len(schema.images) == 3
        assert schema.images[0] == "base64image1"
        assert schema.latitude == -34.603722
        assert schema.longitude == -58.381592

    def test_valid_schema_with_single_image(self):
        """Should accept single image in array."""
        data = {
            "images": ["base64image1"],
            "latitude": -34.603722,
            "longitude": -58.381592,
        }

        schema = AttendanceCheckIn(**data)

        assert len(schema.images) == 1
        assert schema.images[0] == "base64image1"

    def test_valid_schema_with_max_images(self):
        """Should accept up to 5 images."""
        data = {
            "images": ["img1", "img2", "img3", "img4", "img5"],
        }

        schema = AttendanceCheckIn(**data)

        assert len(schema.images) == 5

    def test_backward_compat_single_image_field(self):
        """Should convert deprecated 'image' field to 'images' array."""
        data = {
            "image": "base64image1",  # Old API
            "latitude": -34.603722,
            "longitude": -58.381592,
        }

        schema = AttendanceCheckIn(**data)

        assert len(schema.images) == 1
        assert schema.images[0] == "base64image1"

    def test_images_takes_precedence_over_image(self):
        """If both provided, images should take precedence."""
        data = {
            "image": "old_image",
            "images": ["new_image1", "new_image2"],
        }

        schema = AttendanceCheckIn(**data)

        assert len(schema.images) == 2
        assert schema.images[0] == "new_image1"
        assert schema.images[1] == "new_image2"

    def test_reject_empty_images_array(self):
        """Should reject empty images array (min_length=1)."""
        data = {
            "images": [],
        }

        with pytest.raises(ValidationError) as exc_info:
            AttendanceCheckIn(**data)

        errors = exc_info.value.errors()
        assert any(e["type"] == "too_short" for e in errors)

    def test_reject_too_many_images(self):
        """Should reject more than 5 images (max_length=5)."""
        data = {
            "images": ["img1", "img2", "img3", "img4", "img5", "img6"],
        }

        with pytest.raises(ValidationError) as exc_info:
            AttendanceCheckIn(**data)

        errors = exc_info.value.errors()
        assert any(e["type"] == "too_long" for e in errors)

    def test_reject_missing_images_field(self):
        """Should reject if neither images nor image provided."""
        data = {
            "latitude": -34.603722,
            "longitude": -58.381592,
        }

        with pytest.raises(ValidationError) as exc_info:
            AttendanceCheckIn(**data)

        errors = exc_info.value.errors()
        assert any(e["loc"] == ("images",) for e in errors)

    def test_optional_gps_coordinates(self):
        """GPS coordinates should be optional."""
        data = {
            "images": ["base64image1"],
        }

        schema = AttendanceCheckIn(**data)

        assert schema.latitude is None
        assert schema.longitude is None

    def test_valid_latitude_range(self):
        """Should accept valid latitude (-90 to 90)."""
        data = {
            "images": ["img"],
            "latitude": -90,
            "longitude": 0,
        }
        schema = AttendanceCheckIn(**data)
        assert schema.latitude == -90

        data["latitude"] = 90
        schema = AttendanceCheckIn(**data)
        assert schema.latitude == 90

    def test_reject_invalid_latitude(self):
        """Should reject latitude outside -90 to 90."""
        data = {
            "images": ["img"],
            "latitude": -91,
            "longitude": 0,
        }

        with pytest.raises(ValidationError) as exc_info:
            AttendanceCheckIn(**data)

        errors = exc_info.value.errors()
        assert any(e["type"] == "greater_than_equal" for e in errors)

        data["latitude"] = 91
        with pytest.raises(ValidationError):
            AttendanceCheckIn(**data)

    def test_valid_longitude_range(self):
        """Should accept valid longitude (-180 to 180)."""
        data = {
            "images": ["img"],
            "latitude": 0,
            "longitude": -180,
        }
        schema = AttendanceCheckIn(**data)
        assert schema.longitude == -180

        data["longitude"] = 180
        schema = AttendanceCheckIn(**data)
        assert schema.longitude == 180

    def test_reject_invalid_longitude(self):
        """Should reject longitude outside -180 to 180."""
        data = {
            "images": ["img"],
            "latitude": 0,
            "longitude": -181,
        }

        with pytest.raises(ValidationError) as exc_info:
            AttendanceCheckIn(**data)

        errors = exc_info.value.errors()
        assert any(e["type"] == "greater_than_equal" for e in errors)

        data["longitude"] = 181
        with pytest.raises(ValidationError):
            AttendanceCheckIn(**data)

    def test_optional_device_id(self):
        """Device ID should be optional."""
        data = {
            "images": ["img"],
        }

        schema = AttendanceCheckIn(**data)

        assert schema.device_id is None


class TestAttendanceCheckOutSchema:
    """Test AttendanceCheckOut schema validation."""

    def test_valid_schema_with_images_array(self):
        """Should accept images array."""
        data = {
            "images": ["base64image1", "base64image2", "base64image3"],
            "latitude": -34.603722,
            "longitude": -58.381592,
        }

        schema = AttendanceCheckOut(**data)

        assert len(schema.images) == 3
        assert schema.images[0] == "base64image1"

    def test_backward_compat_single_image_field(self):
        """Should convert deprecated 'image' field to 'images' array."""
        data = {
            "image": "base64image1",
        }

        schema = AttendanceCheckOut(**data)

        assert len(schema.images) == 1
        assert schema.images[0] == "base64image1"

    def test_reject_empty_images_array(self):
        """Should reject empty images array."""
        data = {
            "images": [],
        }

        with pytest.raises(ValidationError) as exc_info:
            AttendanceCheckOut(**data)

        errors = exc_info.value.errors()
        assert any(e["type"] == "too_short" for e in errors)

    def test_reject_too_many_images(self):
        """Should reject more than 5 images."""
        data = {
            "images": ["img1", "img2", "img3", "img4", "img5", "img6"],
        }

        with pytest.raises(ValidationError) as exc_info:
            AttendanceCheckOut(**data)

        errors = exc_info.value.errors()
        assert any(e["type"] == "too_long" for e in errors)


class TestAttendanceResponseSchema:
    """Test AttendanceResponse schema (read-only)."""

    def test_schema_includes_geo_validation_fields(self):
        """Response should include geo_validated and distance_meters."""
        from app.schemas.attendance import AttendanceResponse

        # This is a response model, so we test structure not validation
        # The fields should be defined in the schema
        assert hasattr(AttendanceResponse, "model_fields")
        assert "geo_validated" in AttendanceResponse.model_fields
        assert "distance_meters" in AttendanceResponse.model_fields
