import base64
import io
from typing import Tuple

import face_recognition
import numpy as np
from PIL import Image
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.models.employee import Employee
from app.models.face_embedding import FaceEmbedding

settings = get_settings()


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
        """Extract face embedding from a base64 encoded image."""
        image_array = self.decode_base64_image(image_b64)

        # Find face locations
        face_locations = face_recognition.face_locations(image_array)

        if not face_locations:
            return None

        # Get face encodings (use first face found)
        face_encodings = face_recognition.face_encodings(image_array, face_locations)

        if not face_encodings:
            return None

        return face_encodings[0]

    async def find_best_match(
        self, db: AsyncSession, query_embedding: np.ndarray
    ) -> Tuple[Employee, float] | None:
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
    ) -> Tuple[bool, float]:
        """Compare two face embeddings and return match status and distance."""
        # Calculate Euclidean distance
        distance = np.linalg.norm(known_embedding - query_embedding)

        # face_recognition uses 0.6 as default threshold for Euclidean distance
        is_match = distance <= self.threshold

        # Convert to confidence score (inverse of distance, normalized)
        confidence = max(0, 1 - (distance / 1.0))

        return is_match, confidence
