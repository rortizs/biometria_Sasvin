import base64
import binascii
import io
import warnings
from typing import Any, cast

import face_recognition  # type: ignore[import-not-found]
import numpy as np
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, text  # type: ignore[import-not-found]
from sqlalchemy.ext.asyncio import AsyncSession  # type: ignore[import-not-found]

from app.core.config import get_settings
from app.models.employee import Employee

settings = get_settings()


class FaceRecognitionService:
    def __init__(self, threshold: float | None = None):
        self.threshold = threshold or settings.face_recognition_threshold

    def decode_base64_image(self, image_b64: str) -> np.ndarray:
        """Decode and validate a base64 image string to a RGB numpy array."""
        payload = image_b64.split(",", 1)[1] if "," in image_b64 else image_b64

        try:
            image_data = base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Invalid image payload") from exc

        if len(image_data) > settings.biometric_image_max_bytes:
            raise ValueError("Image payload exceeds maximum size")

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(image_data)) as image:
                    image_format = (image.format or "").upper()
                    allowed_formats = settings.biometric_allowed_image_formats_set
                    if image_format not in allowed_formats:
                        raise ValueError("Unsupported image format")

                    width, height = image.size
                    if (
                        width <= 0
                        or height <= 0
                        or width > settings.biometric_image_max_width
                        or height > settings.biometric_image_max_height
                        or width * height > settings.biometric_image_max_pixels
                    ):
                        raise ValueError("Image dimensions exceed configured limit")

                    image.verify()

                with Image.open(io.BytesIO(image_data)) as image:
                    if image.mode != "RGB":
                        image = image.convert("RGB")
                    return np.array(image)
        except ValueError:
            raise
        except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            raise ValueError("Image dimensions exceed configured limit") from exc
        except (OSError, UnidentifiedImageError) as exc:
            raise ValueError("Invalid image payload") from exc

    def get_face_embedding(self, image_b64: str) -> np.ndarray | None:
        """Extract face embedding from a base64 encoded image."""
        image_array = self.decode_base64_image(image_b64)

        # Find face locations
        face_locations_fn = cast(Any, face_recognition).face_locations
        face_locations = face_locations_fn(image_array)

        if not face_locations:
            return None

        # Get face encodings (use first face found)
        face_encodings_fn = cast(Any, face_recognition).face_encodings
        face_encodings = face_encodings_fn(image_array, face_locations)

        if not face_encodings:
            return None

        return face_encodings[0]

    async def find_best_match(
        self, db: AsyncSession, query_embedding: np.ndarray
    ) -> tuple[Employee, float] | None:
        """Find the best matching employee for a given face embedding."""
        # Convert numpy array to list for SQL query
        embedding_list = query_embedding.tolist()

        # Use pgvector's cosine distance operator
        # Lower distance = better match
        query = text("""
            SELECT
                fe.id,
                fe.employee_id,
                fe.embedding <=> :query_embedding AS distance
            FROM face_embeddings fe
            JOIN employees e ON fe.employee_id = e.id
            WHERE e.is_active = true
            ORDER BY fe.embedding <=> :query_embedding
            LIMIT 1
        """)

        result = await db.execute(query, {"query_embedding": str(embedding_list)})
        row = result.fetchone()

        if row is None:
            return None

        distance = row.distance

        # Convert distance to confidence (1 - distance for cosine)
        # Cosine distance ranges from 0 (identical) to 2 (opposite)
        confidence = 1 - (distance / 2)

        # Check if within threshold
        # For face_recognition library, typical threshold is 0.6 for Euclidean distance
        # For cosine distance, we need to adjust
        if distance > (1 - self.threshold):
            return None

        # Fetch the employee
        emp_result = await db.execute(
            select(Employee).where(Employee.id == row.employee_id)
        )
        employee = emp_result.scalar_one_or_none()

        if employee is None:
            return None

        return employee, confidence

    def compare_faces(
        self, known_embedding: np.ndarray, query_embedding: np.ndarray
    ) -> tuple[bool, float]:
        """Compare two face embeddings and return match status and distance."""
        # Calculate Euclidean distance
        distance = np.linalg.norm(known_embedding - query_embedding)

        # face_recognition uses 0.6 as default threshold for Euclidean distance
        is_match = bool(distance <= self.threshold)

        # Convert to confidence score (inverse of distance, normalized)
        try:
            confidence = float(max(0, 1 - (distance / 1.0)))
        except (TypeError, ValueError):
            confidence = 0.0

        return is_match, confidence

    def check_liveness_from_embeddings(
        self,
        embeddings: list[np.ndarray],
        min_variance_threshold: float = 0.004,
    ) -> tuple[bool, float]:
        """
        Detect liveness from multiple embeddings captured at short intervals.

        A static photo produces near-identical embeddings (cosine distance ≈ 0).
        A live face produces natural micro-variation (blinking, breathing, micro-movement).

        Returns (is_live, max_variance) where:
        - is_live: True if variance exceeds threshold
        - max_variance: maximum cosine distance between any two embeddings

        Requires at least 2 embeddings. With 1 embedding, returns (False, 0.0).
        Threshold 0.004: calibrated for dlib 128-d embeddings with 250ms frame interval.
        """
        if len(embeddings) < 2:
            return False, 0.0

        max_variance = 0.0
        for i in range(len(embeddings)):
            for j in range(i + 1, len(embeddings)):
                # Cosine distance = 1 - cosine_similarity
                a = embeddings[i]
                b = embeddings[j]
                norm_a = np.linalg.norm(a)
                norm_b = np.linalg.norm(b)
                if norm_a == 0 or norm_b == 0:
                    continue
                cosine_sim = np.dot(a, b) / (norm_a * norm_b)
                try:
                    cosine_dist = 1.0 - float(cosine_sim)
                except (TypeError, ValueError):
                    continue
                if cosine_dist > max_variance:
                    max_variance = cosine_dist

        is_live = max_variance >= min_variance_threshold
        return is_live, max_variance
