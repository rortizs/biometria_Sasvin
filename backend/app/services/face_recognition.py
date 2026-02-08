import base64
import io
from dataclasses import dataclass
from typing import Tuple

import face_recognition
import numpy as np
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.employee import Employee
from app.models.face_embedding import FaceEmbedding

settings = get_settings()


@dataclass
class FaceDetectionResult:
    """Result of face detection with validation details."""

    success: bool
    embedding: np.ndarray | None
    face_location: Tuple[int, int, int, int] | None  # (top, right, bottom, left)
    face_width: int
    face_height: int
    is_centered: bool
    num_faces_detected: int
    error_message: str | None = None


class FaceRecognitionService:
    def __init__(self, threshold: float | None = None):
        self.threshold = threshold or settings.face_recognition_threshold

    def decode_base64_image(self, image_b64: str) -> np.ndarray:
        """Decode a base64 image string to numpy array."""
        # Remove data URL prefix if present
        if "," in image_b64:
            image_b64 = image_b64.split(",")[1]

        image_data = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_data))

        # Convert to RGB if necessary
        if image.mode != "RGB":
            image = image.convert("RGB")

        return np.array(image)

    def get_face_embedding(self, image_b64: str) -> np.ndarray | None:
        """
        Extract face embedding from a base64 encoded image.

        Legacy method - returns only embedding for backward compatibility.
        Use get_face_embedding_with_validation() for detailed validation.
        """
        result = self.get_face_embedding_with_validation(image_b64)
        return result.embedding if result.success else None

    def get_face_embedding_with_validation(
        self, image_b64: str, min_face_size: int = 100, center_tolerance: float = 0.3
    ) -> FaceDetectionResult:
        """
        Extract face embedding with comprehensive validation.

        Validations:
        - Exactly 1 face detected (reject if 0 or multiple faces)
        - Minimum face size (default 100x100 pixels)
        - Face is reasonably centered (not in corners)

        Args:
            image_b64: Base64 encoded image
            min_face_size: Minimum face width/height in pixels
            center_tolerance: How far from center is acceptable (0.3 = 30% of image)

        Returns:
            FaceDetectionResult with embedding and validation details
        """
        try:
            image_array = self.decode_base64_image(image_b64)
            img_height, img_width = image_array.shape[:2]

            # Find face locations
            face_locations = face_recognition.face_locations(image_array)

            num_faces = len(face_locations)

            # Validation 1: Exactly 1 face
            if num_faces == 0:
                return FaceDetectionResult(
                    success=False,
                    embedding=None,
                    face_location=None,
                    face_width=0,
                    face_height=0,
                    is_centered=False,
                    num_faces_detected=0,
                    error_message="No face detected in image",
                )

            if num_faces > 1:
                return FaceDetectionResult(
                    success=False,
                    embedding=None,
                    face_location=None,
                    face_width=0,
                    face_height=0,
                    is_centered=False,
                    num_faces_detected=num_faces,
                    error_message=f"Multiple faces detected ({num_faces}). Please ensure only one person is in frame",
                )

            # Get face location (top, right, bottom, left)
            face_location = face_locations[0]
            top, right, bottom, left = face_location

            # Calculate face dimensions
            face_width = right - left
            face_height = bottom - top

            # Validation 2: Minimum face size
            if face_width < min_face_size or face_height < min_face_size:
                return FaceDetectionResult(
                    success=False,
                    embedding=None,
                    face_location=face_location,
                    face_width=face_width,
                    face_height=face_height,
                    is_centered=False,
                    num_faces_detected=1,
                    error_message=f"Face too small: {face_width}x{face_height}px (minimum {min_face_size}px). Move closer to camera",
                )

            # Validation 3: Face is centered
            face_center_x = (left + right) / 2
            face_center_y = (top + bottom) / 2
            img_center_x = img_width / 2
            img_center_y = img_height / 2

            # Calculate distance from center (normalized to 0-1)
            dist_x = abs(face_center_x - img_center_x) / img_width
            dist_y = abs(face_center_y - img_center_y) / img_height

            is_centered = dist_x <= center_tolerance and dist_y <= center_tolerance

            if not is_centered:
                return FaceDetectionResult(
                    success=False,
                    embedding=None,
                    face_location=face_location,
                    face_width=face_width,
                    face_height=face_height,
                    is_centered=False,
                    num_faces_detected=1,
                    error_message="Face not centered. Please center your face in the frame",
                )

            # All validations passed - extract embedding
            face_encodings = face_recognition.face_encodings(
                image_array, face_locations
            )

            if not face_encodings:
                return FaceDetectionResult(
                    success=False,
                    embedding=None,
                    face_location=face_location,
                    face_width=face_width,
                    face_height=face_height,
                    is_centered=is_centered,
                    num_faces_detected=1,
                    error_message="Could not extract face encoding. Face may be partially obscured",
                )

            return FaceDetectionResult(
                success=True,
                embedding=face_encodings[0],
                face_location=face_location,
                face_width=face_width,
                face_height=face_height,
                is_centered=is_centered,
                num_faces_detected=1,
                error_message=None,
            )

        except Exception as e:
            return FaceDetectionResult(
                success=False,
                embedding=None,
                face_location=None,
                face_width=0,
                face_height=0,
                is_centered=False,
                num_faces_detected=0,
                error_message=f"Error processing image: {str(e)}",
            )

    async def find_best_match(
        self, db: AsyncSession, query_embedding: np.ndarray
    ) -> Tuple[Employee, float] | None:
        """Find the best matching employee for a given face embedding.

        Uses Euclidean distance calculated in Python. For <10,000 employees,
        this approach provides acceptable performance (<100ms) without requiring
        specialized vector indexing (pgvector).
        """
        # Fetch all active face embeddings with their employees
        query = (
            select(FaceEmbedding, Employee)
            .join(Employee, FaceEmbedding.employee_id == Employee.id)
            .where(Employee.is_active == True)
        )

        result = await db.execute(query)
        embeddings_with_employees = result.all()

        if not embeddings_with_employees:
            return None

        # Calculate Euclidean distance for each embedding
        best_match = None
        best_distance = float("inf")
        best_employee = None

        for face_embedding, employee in embeddings_with_employees:
            # Convert database array to numpy array
            known_embedding = np.array(face_embedding.embedding, dtype=np.float64)

            # Calculate Euclidean distance
            distance = np.linalg.norm(known_embedding - query_embedding)

            if distance < best_distance:
                best_distance = distance
                best_match = face_embedding
                best_employee = employee

        # Check if within threshold (0.6 is standard for face_recognition library)
        if best_distance > self.threshold:
            return None

        # Convert distance to confidence (inverse of distance, normalized to 0-1)
        # Distance of 0 = confidence 1.0, distance of 1.0 = confidence 0
        confidence = max(0, 1 - best_distance)

        return best_employee, confidence

    def compare_faces(
        self, known_embedding: np.ndarray, query_embedding: np.ndarray
    ) -> Tuple[bool, float]:
        """Compare two face embeddings and return match status and distance."""
        # Calculate Euclidean distance
        distance = np.linalg.norm(known_embedding - query_embedding)

        # face_recognition uses 0.6 as default threshold for Euclidean distance
        is_match = distance <= self.threshold

        # Convert to confidence score (inverse of distance, normalized)
        confidence = max(0, 1 - (distance / 1.0))

        return is_match, confidence
