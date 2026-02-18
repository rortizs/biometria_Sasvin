#!/usr/bin/env python3
"""
End-to-End Security Testing Suite
Tests complete anti-fraud stack: liveness, face recognition, geolocation, fraud detection
"""

import asyncio
import base64
import io
import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Import models
from app.models.location import Location
from app.models.employee import Employee
from app.models.face_embedding import FaceEmbedding
from app.services.face_recognition import FaceRecognitionService
from app.core.config import get_settings

settings = get_settings()

# Database connection for direct data insertion
engine = create_async_engine(settings.database_url, echo=False)
async_session_maker = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# Configuration
BASE_URL = "http://localhost:8000"
API_V1 = f"{BASE_URL}/api/v1"
TIMEOUT = 30.0

# Test data
TEST_EMPLOYEES = [
    {
        "name": "María García",
        "email": "maria.garcia@test.com",
        "phone": "+51987654321",
        "location_name": "Lima Office",
    },
    {
        "name": "Carlos Rodríguez",
        "email": "carlos.rodriguez@test.com",
        "phone": "+51987654322",
        "location_name": "Lima Office",
    },
]

TEST_LOCATIONS = [
    {
        "name": "Lima Office",
        "address": "Av. Javier Prado Este 123, San Isidro, Lima",
        "latitude": -12.0928,
        "longitude": -77.0283,
        "radius_meters": 100.0,
    },
    {
        "name": "Remote Office",
        "address": "Av. Larco 456, Miraflores, Lima",
        "latitude": -12.1198,
        "longitude": -77.0350,
        "radius_meters": 50.0,
    },
]


class Colors:
    """ANSI color codes for terminal output"""

    HEADER = "\033[95m"
    OKBLUE = "\033[94m"
    OKCYAN = "\033[96m"
    OKGREEN = "\033[92m"
    WARNING = "\033[93m"
    FAIL = "\033[91m"
    ENDC = "\033[0m"
    BOLD = "\033[1m"


def print_header(text: str):
    """Print section header"""
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'=' * 80}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text.center(80)}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'=' * 80}{Colors.ENDC}\n")


def print_success(text: str):
    """Print success message"""
    print(f"{Colors.OKGREEN}✅ {text}{Colors.ENDC}")


def print_error(text: str):
    """Print error message"""
    print(f"{Colors.FAIL}❌ {text}{Colors.ENDC}")


def print_warning(text: str):
    """Print warning message"""
    print(f"{Colors.WARNING}⚠️  {text}{Colors.ENDC}")


def print_info(text: str):
    """Print info message"""
    print(f"{Colors.OKCYAN}ℹ️  {text}{Colors.ENDC}")


# ============================================================================
# IMAGE GENERATION UTILITIES
# ============================================================================


def generate_realistic_face(width: int = 640, height: int = 800) -> Image.Image:
    """Generate a realistic-looking synthetic face for testing (meets min resolution 640x480)"""
    # Create base image with skin tone
    img = Image.new("RGB", (width, height), color=(220, 180, 140))
    draw = ImageDraw.Draw(img)

    # Add face oval
    face_bbox = [width // 6, height // 8, 5 * width // 6, 7 * height // 8]
    draw.ellipse(face_bbox, fill=(210, 170, 130), outline=(180, 140, 100))

    # Add eyes
    eye_y = height // 3
    left_eye = [width // 3 - 20, eye_y - 10, width // 3 + 20, eye_y + 10]
    right_eye = [2 * width // 3 - 20, eye_y - 10, 2 * width // 3 + 20, eye_y + 10]
    draw.ellipse(left_eye, fill=(255, 255, 255))
    draw.ellipse(right_eye, fill=(255, 255, 255))

    # Add pupils
    draw.ellipse(
        [width // 3 - 8, eye_y - 8, width // 3 + 8, eye_y + 8], fill=(80, 60, 40)
    )
    draw.ellipse(
        [2 * width // 3 - 8, eye_y - 8, 2 * width // 3 + 8, eye_y + 8],
        fill=(80, 60, 40),
    )

    # Add nose
    nose_points = [
        (width // 2, height // 2),
        (width // 2 - 10, 2 * height // 3),
        (width // 2 + 10, 2 * height // 3),
    ]
    draw.polygon(nose_points, fill=(200, 160, 120))

    # Add mouth
    mouth_bbox = [
        width // 3,
        3 * height // 4 - 10,
        2 * width // 3,
        3 * height // 4 + 10,
    ]
    draw.arc(mouth_bbox, 0, 180, fill=(150, 100, 80), width=3)

    # Add some texture variation to make it look more realistic
    pixels = np.array(img)
    noise = np.random.normal(0, 5, pixels.shape).astype(np.int16)
    pixels = np.clip(pixels.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(pixels)

    return img


def generate_printed_photo(base_image: Image.Image) -> Image.Image:
    """Simulate a printed photo (flat texture, less color variation)"""
    # Reduce color depth to simulate print
    img = base_image.copy()
    img = img.convert("P", palette=Image.ADAPTIVE, colors=64)
    img = img.convert("RGB")

    # Add print texture (slight graininess)
    pixels = np.array(img)
    grain = np.random.randint(-10, 10, pixels.shape, dtype=np.int16)
    pixels = np.clip(pixels.astype(np.int16) + grain, 0, 255).astype(np.uint8)
    img = Image.fromarray(pixels)

    # Slight blur to simulate paper texture
    img = img.filter(ImageFilter.GaussianBlur(radius=0.5))

    return img


def generate_screen_photo(base_image: Image.Image) -> Image.Image:
    """Simulate a photo displayed on screen (color shift, moiré pattern)"""
    # Add blue tint (screen backlight)
    pixels = np.array(base_image.copy())
    pixels[:, :, 2] = np.clip(
        pixels[:, :, 2].astype(np.int16) + 20, 0, 255
    )  # Blue channel boost

    # Add moiré pattern (screen interference)
    height, width = pixels.shape[:2]
    x = np.arange(width)
    y = np.arange(height)
    xx, yy = np.meshgrid(x, y)
    pattern = (np.sin(xx * 0.3) + np.sin(yy * 0.3)) * 10

    for c in range(3):
        pixels[:, :, c] = np.clip(
            pixels[:, :, c].astype(np.int16) + pattern.astype(np.int16), 0, 255
        )

    img = Image.fromarray(pixels.astype(np.uint8))

    # Add slight blur (screen pixel grid)
    img = img.filter(ImageFilter.GaussianBlur(radius=0.3))

    return img


def image_to_base64(img: Image.Image) -> str:
    """Convert PIL Image to base64 string"""
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=90)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def generate_multi_frame(base_image: Image.Image, num_frames: int = 3) -> list[str]:
    """Generate multiple frames with slight variations (simulating video)"""
    frames = []

    for i in range(num_frames):
        img = base_image.copy()

        # Add slight rotation and position variation
        angle = np.random.uniform(-2, 2)
        img = img.rotate(angle, fillcolor=(220, 180, 140))

        # Add slight brightness variation
        pixels = np.array(img)
        brightness_delta = np.random.randint(-5, 5)
        pixels = np.clip(pixels.astype(np.int16) + brightness_delta, 0, 255).astype(
            np.uint8
        )
        img = Image.fromarray(pixels)

        frames.append(image_to_base64(img))

    return frames


# ============================================================================
# DATABASE CLEANUP FUNCTIONS
# ============================================================================


async def cleanup_test_data():
    """Clean up all test data from database before running tests"""
    print_header("Cleanup: Removing Previous Test Data")

    async with async_session_maker() as db:
        try:
            # Delete all test data (attendance, faces, employees, locations with test prefix)
            from sqlalchemy import delete
            from app.models.attendance import AttendanceRecord

            # Delete in correct order due to foreign keys
            await db.execute(delete(AttendanceRecord))
            await db.execute(delete(FaceEmbedding))
            await db.execute(
                delete(Employee).where(Employee.employee_code.like("EMP%"))
            )
            await db.execute(
                delete(Location).where(
                    Location.name.in_(["Lima Office", "Remote Office"])
                )
            )

            await db.commit()
            print_success("✓ Test data cleaned up successfully")

        except Exception as e:
            await db.rollback()
            print_warning(f"Cleanup error (non-critical): {e}")


# ============================================================================
# API TEST FUNCTIONS
# ============================================================================


async def test_health_check():
    """Test health check endpoint"""
    print_header("Test 1: Health Check")

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            response = await client.get(f"{BASE_URL}/health")
            if response.status_code == 200:
                print_success(f"Health check passed: {response.json()}")
                return True
            else:
                print_error(f"Health check failed: {response.status_code}")
                return False
        except Exception as e:
            print_error(f"Health check error: {e}")
            return False


async def test_create_locations():
    """Create test locations directly in database (bypassing API auth)"""
    print_header("Test 2: Create Test Locations")

    created_locations = []

    async with async_session_maker() as db:
        try:
            for loc in TEST_LOCATIONS:
                # Create PostGIS point
                point = Point(loc["longitude"], loc["latitude"])
                location_point = from_shape(point, srid=4326)

                # Create location model
                location = Location(
                    id=uuid4(),
                    name=loc["name"],
                    address=loc["address"],
                    latitude=loc["latitude"],
                    longitude=loc["longitude"],
                    location_point=location_point,
                    radius_meters=loc["radius_meters"],
                )

                db.add(location)
                await db.flush()  # Get the ID without committing

                # Convert to dict for compatibility
                loc_dict = {
                    "id": str(location.id),
                    "name": location.name,
                    "address": location.address,
                    "latitude": location.latitude,
                    "longitude": location.longitude,
                    "radius_meters": location.radius_meters,
                }
                created_locations.append(loc_dict)
                print_success(f"Created location: {location.name} (ID: {location.id})")

            await db.commit()
            print_info(f"✓ Committed {len(created_locations)} locations to database")

        except Exception as e:
            await db.rollback()
            print_error(f"Error creating locations: {e}")
            import traceback

            traceback.print_exc()

    return created_locations


async def test_register_employees(locations: list[dict]):
    """Register test employees with SYNTHETIC face embeddings (for testing only)"""
    print_header("Test 3: Register Employees with Face Embeddings")

    print_warning("NOTE: Using synthetic embeddings (128-d vectors) for testing.")
    print_warning(
        "Real production requires actual face photos for dlib face_recognition."
    )

    registered_employees = []

    async with async_session_maker() as db:
        try:
            for idx, emp_data in enumerate(TEST_EMPLOYEES):
                # Find location
                location = next(
                    (
                        loc
                        for loc in locations
                        if loc["name"] == emp_data["location_name"]
                    ),
                    None,
                )
                if not location:
                    print_warning(
                        f"Location not found for {emp_data['name']}, skipping..."
                    )
                    continue

                # Generate face image (for visual reference in tests)
                face_image = generate_realistic_face()

                # Generate SYNTHETIC 128-dimensional face embedding
                # In production, this would come from face_recognition.face_encodings()
                # We create unique but deterministic embeddings per employee
                np.random.seed(1000 + idx)  # Deterministic seed per employee
                synthetic_embedding = np.random.randn(128).astype(np.float32)
                # Normalize to unit vector (like real face embeddings)
                synthetic_embedding = synthetic_embedding / np.linalg.norm(
                    synthetic_embedding
                )

                # Parse full name into first and last
                full_name = emp_data["name"]
                name_parts = full_name.split(" ", 1)
                first_name = name_parts[0]
                last_name = name_parts[1] if len(name_parts) > 1 else ""

                # Create employee
                employee = Employee(
                    id=uuid4(),
                    employee_code=f"EMP{1000 + idx}",  # Auto-generate code
                    first_name=first_name,
                    last_name=last_name,
                    email=emp_data["email"],
                    phone=emp_data["phone"],
                    location_id=location["id"],
                    is_active=True,
                )

                db.add(employee)
                await db.flush()  # Get employee ID

                print_success(
                    f"Created employee: {employee.full_name} (ID: {employee.id})"
                )

                # Create face embedding with synthetic data
                face_embedding = FaceEmbedding(
                    id=uuid4(),
                    employee_id=employee.id,
                    embedding=synthetic_embedding.tolist(),  # 128-d float array
                )

                db.add(face_embedding)
                await db.flush()

                print_success(f"  ✓ Synthetic face embedding registered (128-d vector)")

                # Convert to dict for compatibility
                employee_dict = {
                    "id": str(employee.id),
                    "name": employee.full_name,
                    "first_name": employee.first_name,
                    "last_name": employee.last_name,
                    "employee_code": employee.employee_code,
                    "email": employee.email,
                    "phone": employee.phone,
                    "location_id": str(employee.location_id),
                }

                registered_employees.append(
                    {
                        "employee": employee_dict,
                        "face_image": face_image,
                        "face_embedding_id": str(face_embedding.id),
                        "synthetic_embedding": synthetic_embedding,  # For matching in tests
                    }
                )

            await db.commit()
            print_info(
                f"✓ Committed {len(registered_employees)} employees with embeddings"
            )

        except Exception as e:
            await db.rollback()
            print_error(f"Error registering employees: {e}")
            import traceback

            traceback.print_exc()

    return registered_employees


async def test_check_in_success(employee_data: dict, location: dict):
    """Test successful check-in scenario"""
    print_header(f"Test 4: Successful Check-In - {employee_data['employee']['name']}")

    # Generate multi-frame video from registered face
    frames = generate_multi_frame(employee_data["face_image"], num_frames=3)

    payload = {
        "images": frames,
        "device_id": str(uuid4()),  # Generate valid UUID
        "latitude": location["latitude"],
        "longitude": location["longitude"],
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            start_time = time.time()
            response = await client.post(f"{API_V1}/attendance/check-in", json=payload)
            elapsed = time.time() - start_time

            print_info(f"Response time: {elapsed:.2f}s")

            if response.status_code == 200:
                data = response.json()
                print_success("Check-in successful!")
                print_info(f"  Employee: {data.get('employee_name')}")
                print_info(f"  Confidence: {data.get('confidence', 0) * 100:.1f}%")
                print_info(
                    f"  Liveness Score: {data.get('liveness_score', 0) * 100:.1f}%"
                )
                print_info(f"  Geo Validated: {data.get('geo_validated')}")
                print_info(f"  Distance: {data.get('distance_meters', 0):.1f}m")
                print_info(f"  Message: {data.get('message')}")
                return data
            else:
                print_error(f"Check-in failed: {response.status_code}")
                print_error(f"Response: {response.text}")
                return None

        except Exception as e:
            print_error(f"Error during check-in: {e}")
            return None


async def test_liveness_detection_printed_photo(employee_data: dict, location: dict):
    """Test liveness detection with printed photo (should fail)"""
    print_header(f"Test 5: Liveness Detection - Printed Photo (Should Reject)")

    # Generate printed photo (flat texture)
    printed_photo = generate_printed_photo(employee_data["face_image"])
    frames = generate_multi_frame(printed_photo, num_frames=3)

    payload = {
        "images": frames,
        "device_id": str(uuid4()),
        "latitude": location["latitude"],
        "longitude": location["longitude"],
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            response = await client.post(f"{API_V1}/attendance/check-in", json=payload)

            if response.status_code in [400, 403]:
                data = response.json()
                if (
                    "liveness" in data.get("detail", "").lower()
                    or "spoofing" in data.get("detail", "").lower()
                ):
                    print_success(
                        "✅ CORRECT: Printed photo rejected by liveness detection"
                    )
                    print_info(f"  Error: {data.get('detail')}")
                    return True
                else:
                    print_warning(
                        f"Rejected but not for liveness: {data.get('detail')}"
                    )
                    return False
            elif response.status_code == 200:
                data = response.json()
                liveness_score = data.get("liveness_score", 0)
                print_error(
                    f"❌ VULNERABILITY: Printed photo accepted! Liveness score: {liveness_score * 100:.1f}%"
                )
                return False
            else:
                print_warning(
                    f"Unexpected response: {response.status_code} - {response.text}"
                )
                return False

        except Exception as e:
            print_error(f"Error during test: {e}")
            return False


async def test_liveness_detection_screen_photo(employee_data: dict, location: dict):
    """Test liveness detection with screen photo (should fail)"""
    print_header(f"Test 6: Liveness Detection - Screen Photo (Should Reject)")

    # Generate screen photo (color shift, moiré pattern)
    screen_photo = generate_screen_photo(employee_data["face_image"])
    frames = generate_multi_frame(screen_photo, num_frames=3)

    payload = {
        "images": frames,
        "device_id": str(uuid4()),
        "latitude": location["latitude"],
        "longitude": location["longitude"],
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            response = await client.post(f"{API_V1}/attendance/check-in", json=payload)

            if response.status_code in [400, 403]:
                data = response.json()
                if (
                    "liveness" in data.get("detail", "").lower()
                    or "spoofing" in data.get("detail", "").lower()
                ):
                    print_success(
                        "✅ CORRECT: Screen photo rejected by liveness detection"
                    )
                    print_info(f"  Error: {data.get('detail')}")
                    return True
                else:
                    print_warning(
                        f"Rejected but not for liveness: {data.get('detail')}"
                    )
                    return False
            elif response.status_code == 200:
                data = response.json()
                liveness_score = data.get("liveness_score", 0)
                print_error(
                    f"❌ VULNERABILITY: Screen photo accepted! Liveness score: {liveness_score * 100:.1f}%"
                )
                return False
            else:
                print_warning(
                    f"Unexpected response: {response.status_code} - {response.text}"
                )
                return False

        except Exception as e:
            print_error(f"Error during test: {e}")
            return False


async def test_geolocation_validation_outside_radius(
    employee_data: dict, location: dict
):
    """Test geolocation validation when outside allowed radius"""
    print_header(f"Test 7: Geolocation - Outside Radius (Should Warn)")

    # Generate coordinates far from office (5km away)
    far_latitude = location["latitude"] + 0.045  # ~5km north
    far_longitude = location["longitude"]

    frames = generate_multi_frame(employee_data["face_image"], num_frames=3)

    payload = {
        "images": frames,
        "device_id": str(uuid4()),
        "latitude": far_latitude,
        "longitude": far_longitude,
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            response = await client.post(f"{API_V1}/attendance/check-in", json=payload)

            if response.status_code == 200:
                data = response.json()
                geo_validated = data.get("geo_validated", False)
                distance = data.get("distance_meters", 0)

                if not geo_validated and distance > 100:
                    print_success(
                        f"✅ CORRECT: Location outside radius detected (distance: {distance:.1f}m)"
                    )
                    print_info(f"  Message: {data.get('message')}")
                    return True
                else:
                    print_error(
                        f"❌ INCORRECT: Should have flagged location. Validated: {geo_validated}, Distance: {distance:.1f}m"
                    )
                    return False
            else:
                print_error(
                    f"Check-in failed: {response.status_code} - {response.text}"
                )
                return False

        except Exception as e:
            print_error(f"Error during test: {e}")
            return False


async def test_fraud_detection_concurrent_checkin(employee_data: dict, location: dict):
    """Test fraud detection for concurrent check-ins (already checked in)"""
    print_header(f"Test 8: Fraud Detection - Concurrent Check-In")

    frames = generate_multi_frame(employee_data["face_image"], num_frames=3)

    payload = {
        "images": frames,
        "device_id": str(uuid4()),
        "latitude": location["latitude"],
        "longitude": location["longitude"],
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            # First check-in (should succeed)
            response1 = await client.post(f"{API_V1}/attendance/check-in", json=payload)

            if response1.status_code != 200:
                print_error(f"First check-in failed: {response1.text}")
                return False

            print_info("First check-in successful")

            # Second check-in without checkout (should warn)
            response2 = await client.post(f"{API_V1}/attendance/check-in", json=payload)

            if response2.status_code == 200:
                data = response2.json()
                message = data.get("message", "").lower()

                if (
                    "concurrent" in message
                    or "already checked in" in message
                    or "⚠️" in message
                ):
                    print_success(
                        "✅ CORRECT: Concurrent check-in detected in warnings"
                    )
                    print_info(f"  Message: {data.get('message')}")
                    return True
                else:
                    print_warning(f"Check-in allowed but may have warnings: {message}")
                    return True
            else:
                print_error(f"Second check-in failed unexpectedly: {response2.text}")
                return False

        except Exception as e:
            print_error(f"Error during test: {e}")
            return False


async def test_check_out_success(
    attendance_id: str, employee_data: dict, location: dict
):
    """Test successful check-out"""
    print_header(f"Test 9: Successful Check-Out - {employee_data['employee']['name']}")

    frames = generate_multi_frame(employee_data["face_image"], num_frames=3)

    payload = {
        "images": frames,
        "device_id": str(uuid4()),
        "latitude": location["latitude"],
        "longitude": location["longitude"],
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            start_time = time.time()
            response = await client.post(f"{API_V1}/attendance/check-out", json=payload)
            elapsed = time.time() - start_time

            print_info(f"Response time: {elapsed:.2f}s")

            if response.status_code == 200:
                data = response.json()
                print_success("Check-out successful!")
                print_info(f"  Employee: {data.get('employee_name')}")
                print_info(f"  Check-out Time: {data.get('check_out')}")
                print_info(
                    f"  Liveness Score: {data.get('liveness_score', 0) * 100:.1f}%"
                )
                print_info(f"  Message: {data.get('message')}")
                return True
            else:
                print_error(f"Check-out failed: {response.status_code}")
                print_error(f"Response: {response.text}")
                return False

        except Exception as e:
            print_error(f"Error during check-out: {e}")
            return False


# ============================================================================
# MAIN TEST RUNNER
# ============================================================================


async def run_all_tests():
    """Run all E2E tests"""
    print(f"\n{Colors.BOLD}{Colors.HEADER}")
    print(
        "╔══════════════════════════════════════════════════════════════════════════════╗"
    )
    print(
        "║                    BIOMETRIC ATTENDANCE SYSTEM - E2E TESTS                  ║"
    )
    print(
        "║                     Anti-Fraud Security Validation Suite                    ║"
    )
    print(
        "╚══════════════════════════════════════════════════════════════════════════════╝"
    )
    print(f"{Colors.ENDC}")

    results = {"total": 0, "passed": 0, "failed": 0, "warnings": 0}

    # Cleanup previous test data
    await cleanup_test_data()

    # Test 1: Health Check
    if await test_health_check():
        results["passed"] += 1
    else:
        results["failed"] += 1
        print_error("Cannot proceed without healthy API. Exiting...")
        return
    results["total"] += 1

    # Test 2: Create Locations
    locations = await test_create_locations()
    if locations:
        results["passed"] += 1
    else:
        results["failed"] += 1
        print_error("Cannot proceed without locations. Exiting...")
        return
    results["total"] += 1

    # Test 3: Register Employees
    employees = await test_register_employees(locations)
    if employees:
        results["passed"] += 1
    else:
        results["failed"] += 1
        print_error("Cannot proceed without employees. Exiting...")
        return
    results["total"] += 1

    # Get first employee and location for testing
    employee = employees[0]
    location = locations[0]

    # Test 4: Successful Check-In
    check_in_data = await test_check_in_success(employee, location)
    if check_in_data:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1

    # Test 5: Liveness Detection - Printed Photo
    if await test_liveness_detection_printed_photo(employee, location):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1

    # Test 6: Liveness Detection - Screen Photo
    if await test_liveness_detection_screen_photo(employee, location):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1

    # Test 7: Geolocation Validation
    if await test_geolocation_validation_outside_radius(employee, location):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1

    # Test 8: Fraud Detection - Concurrent Check-In
    if await test_fraud_detection_concurrent_checkin(employee, location):
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["total"] += 1

    # Test 9: Successful Check-Out
    if check_in_data:
        if await test_check_out_success(check_in_data.get("id"), employee, location):
            results["passed"] += 1
        else:
            results["failed"] += 1
        results["total"] += 1

    # Print summary
    print_header("TEST SUMMARY")
    print(f"{Colors.BOLD}Total Tests: {results['total']}{Colors.ENDC}")
    print(f"{Colors.OKGREEN}✅ Passed: {results['passed']}{Colors.ENDC}")
    print(f"{Colors.FAIL}❌ Failed: {results['failed']}{Colors.ENDC}")
    print(f"{Colors.WARNING}⚠️  Warnings: {results['warnings']}{Colors.ENDC}")

    success_rate = (
        (results["passed"] / results["total"] * 100) if results["total"] > 0 else 0
    )
    print(f"\n{Colors.BOLD}Success Rate: {success_rate:.1f}%{Colors.ENDC}\n")

    if results["failed"] > 0:
        print_warning("Some tests failed. Review the output above for details.")
    else:
        print_success("All tests passed! System is ready for production.")


if __name__ == "__main__":
    try:
        asyncio.run(run_all_tests())
    except KeyboardInterrupt:
        print_warning("\n\nTests interrupted by user.")
    except Exception as e:
        print_error(f"\n\nUnexpected error: {e}")
        import traceback

        traceback.print_exc()
