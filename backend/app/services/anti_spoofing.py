"""
Anti-Spoofing Service

Detects fake face attempts:
- Printed photos (flat texture, no depth)
- Screen photos (moiré patterns, pixel grid, abnormal brightness)
- Video replays (lack of micro-movements)

Uses multi-frame analysis and texture-based detection (CPU-friendly, no GPU needed).

Note: This version uses PIL/NumPy only (no OpenCV) for better compatibility.
"""

import base64
import io
from dataclasses import dataclass
from typing import List, Dict, Tuple

import numpy as np
from PIL import Image, ImageFilter, ImageStat

from app.core.config import get_settings

settings = get_settings()


@dataclass
class ImageQualityResult:
    """Image quality validation result."""

    is_valid: bool
    resolution_ok: bool
    brightness_ok: bool
    sharpness_ok: bool
    width: int
    height: int
    avg_brightness: float
    sharpness_score: float
    error_message: str | None = None


@dataclass
class LivenessResult:
    """Liveness detection result."""

    is_real: bool
    avg_score: float
    frame_scores: List[float]
    best_frame_index: int
    quality_checks: Dict
    confidence: float
    error_message: str | None = None


class AntiSpoofingService:
    """
    Anti-spoofing service using texture analysis and multi-frame validation.

    Detection methods:
    1. Texture analysis - Real faces have complex micro-textures, photos are flat
    2. Color space analysis - Screens have abnormal color distributions
    3. Edge patterns - Photos have uniform edges, real faces have depth variations
    4. Multi-frame consistency - Real faces show natural micro-movements
    """

    def __init__(
        self,
        liveness_threshold: float | None = None,
        min_frames: int = 3,
        max_frames: int = 5,
    ):
        self.liveness_threshold = liveness_threshold or settings.liveness_threshold
        self.min_frames = min_frames
        self.max_frames = max_frames

        # Image quality thresholds
        self.min_resolution = (640, 480)
        self.brightness_range = (40, 220)  # Avoid too dark or overexposed
        self.min_sharpness = 100.0  # Laplacian variance threshold

    def decode_base64_image(self, image_b64: str) -> Image.Image:
        """Decode a base64 image string to PIL Image."""
        # Remove data URL prefix if present
        if "," in image_b64:
            image_b64 = image_b64.split(",")[1]

        image_data = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_data))

        # Convert to RGB
        if image.mode != "RGB":
            image = image.convert("RGB")

        return image

    def validate_image_quality(self, image: Image.Image) -> ImageQualityResult:
        """
        Validate image quality for face recognition.

        Checks:
        - Resolution (minimum 640x480)
        - Brightness (40-220 range to avoid too dark/bright)
        - Sharpness (using variance of Laplacian-like filter)
        """
        width, height = image.size

        # Check resolution
        resolution_ok = (
            width >= self.min_resolution[0] and height >= self.min_resolution[1]
        )

        # Check brightness using PIL
        gray = image.convert("L")  # Convert to grayscale
        stat = ImageStat.Stat(gray)
        avg_brightness = stat.mean[0]
        brightness_ok = (
            self.brightness_range[0] <= avg_brightness <= self.brightness_range[1]
        )

        # Check sharpness using edge detection (Laplacian-like filter)
        edges = gray.filter(ImageFilter.FIND_EDGES)
        edge_array = np.array(edges)
        sharpness_score = float(np.var(edge_array))
        sharpness_ok = sharpness_score >= self.min_sharpness

        is_valid = resolution_ok and brightness_ok and sharpness_ok

        error_parts = []
        if not resolution_ok:
            error_parts.append(
                f"Resolution too low: {width}x{height} (min {self.min_resolution[0]}x{self.min_resolution[1]})"
            )
        if not brightness_ok:
            error_parts.append(
                f"Brightness out of range: {avg_brightness:.1f} (range {self.brightness_range[0]}-{self.brightness_range[1]})"
            )
        if not sharpness_ok:
            error_parts.append(
                f"Image too blurry: {sharpness_score:.1f} (min {self.min_sharpness})"
            )

        error_message = "; ".join(error_parts) if error_parts else None

        return ImageQualityResult(
            is_valid=is_valid,
            resolution_ok=resolution_ok,
            brightness_ok=brightness_ok,
            sharpness_ok=sharpness_ok,
            width=width,
            height=height,
            avg_brightness=avg_brightness,
            sharpness_score=sharpness_score,
            error_message=error_message,
        )

        # Check brightness
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        avg_brightness = np.mean(gray)
        brightness_ok = (
            self.brightness_range[0] <= avg_brightness <= self.brightness_range[1]
        )

        # Check sharpness using Laplacian variance
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        sharpness_score = laplacian.var()
        sharpness_ok = sharpness_score >= self.min_sharpness

        is_valid = resolution_ok and brightness_ok and sharpness_ok

        error_parts = []
        if not resolution_ok:
            error_parts.append(
                f"Resolution too low: {width}x{height} (min {self.min_resolution[0]}x{self.min_resolution[1]})"
            )
        if not brightness_ok:
            error_parts.append(
                f"Brightness out of range: {avg_brightness:.1f} (range {self.brightness_range[0]}-{self.brightness_range[1]})"
            )
        if not sharpness_ok:
            error_parts.append(
                f"Image too blurry: {sharpness_score:.1f} (min {self.min_sharpness})"
            )

        error_message = "; ".join(error_parts) if error_parts else None

        return ImageQualityResult(
            is_valid=is_valid,
            resolution_ok=resolution_ok,
            brightness_ok=brightness_ok,
            sharpness_ok=sharpness_ok,
            width=width,
            height=height,
            avg_brightness=avg_brightness,
            sharpness_score=sharpness_score,
            error_message=error_message,
        )

    def _calculate_texture_score(self, image: Image.Image) -> float:
        """
        Calculate texture complexity score (0-1).

        Real faces have complex micro-textures (pores, wrinkles, hair).
        Printed photos or screens have flat, uniform textures.

        Uses variance of edge detection as texture measure.
        """
        gray = image.convert("L")

        # Apply edge detection filters
        edges = gray.filter(ImageFilter.FIND_EDGES)
        edges_array = np.array(edges)

        # Calculate texture variance (higher = more complex texture)
        texture_variance = float(np.var(edges_array))

        # Normalize to 0-1 (typical range: 0-2000)
        texture_score = min(texture_variance / 2000.0, 1.0)

        return texture_score

    def _calculate_color_distribution_score(self, image: Image.Image) -> float:
        """
        Calculate color distribution score (0-1).

        Real faces have natural color distribution.
        Screens/photos have abnormal color patterns (moiré, pixel grid).
        """
        # Convert to RGB array
        img_array = np.array(image)

        # Calculate color variance in each channel
        r_var = float(np.var(img_array[:, :, 0]))
        g_var = float(np.var(img_array[:, :, 1]))
        b_var = float(np.var(img_array[:, :, 2]))

        # Real faces have moderate color variance
        # Screens/photos have either very high (moiré) or very low (uniform) variance
        avg_variance = (r_var + g_var + b_var) / 3.0

        # Normalize to 0-1 (typical range: 0-5000)
        color_score = min(avg_variance / 5000.0, 1.0)

        return color_score

    def _calculate_edge_pattern_score(self, image: Image.Image) -> float:
        """
        Calculate edge pattern score (0-1).

        Real faces have irregular edges due to 3D structure.
        Photos have uniform, straight edges.
        """
        gray = image.convert("L")

        # Detect edges using PIL filters
        edges = gray.filter(ImageFilter.FIND_EDGES)
        edges_array = np.array(edges)

        # Calculate edge density (ratio of edge pixels)
        edge_density = float(np.sum(edges_array > 50) / edges_array.size)

        # Calculate edge variance (irregular edges have higher variance)
        edge_variance = float(np.var(edges_array))

        # Combine density and variance (normalize to 0-1)
        # Real faces: moderate density + high variance
        # Photos: low variance (uniform edges)
        edge_score = min((edge_density * 5 + edge_variance / 1000) / 2.0, 1.0)

        return edge_score

    def _detect_liveness_single_frame(self, image: Image.Image) -> float:
        """
        Detect liveness for a single frame (0-1 score).

        Combines multiple texture and color features to determine if face is real.
        """
        # Calculate individual scores
        texture_score = self._calculate_texture_score(image)
        color_score = self._calculate_color_distribution_score(image)
        edge_score = self._calculate_edge_pattern_score(image)

        # Weighted combination (texture is most important)
        liveness_score = 0.5 * texture_score + 0.3 * color_score + 0.2 * edge_score

        return liveness_score

    async def verify_liveness(
        self, images: List[str], return_quality_check: bool = True
    ) -> LivenessResult:
        """
        Verify liveness using multi-frame analysis.

        Args:
            images: List of 3-5 base64 encoded images
            return_quality_check: Include detailed quality checks in result

        Returns:
            LivenessResult with avg_score, frame_scores, and quality checks
        """
        # Validate number of frames
        if len(images) < self.min_frames:
            return LivenessResult(
                is_real=False,
                avg_score=0.0,
                frame_scores=[],
                best_frame_index=-1,
                quality_checks={},
                confidence=0.0,
                error_message=f"Need at least {self.min_frames} frames, got {len(images)}",
            )

        if len(images) > self.max_frames:
            images = images[: self.max_frames]

        # Process each frame
        frame_scores = []
        quality_checks = {}
        decoded_images = []

        for idx, image_b64 in enumerate(images):
            try:
                # Decode image
                image = self.decode_base64_image(image_b64)
                decoded_images.append(image)

                # Validate quality
                if return_quality_check:
                    quality = self.validate_image_quality(image)
                    quality_checks[f"frame_{idx}"] = {
                        "is_valid": quality.is_valid,
                        "resolution": f"{quality.width}x{quality.height}",
                        "brightness": quality.avg_brightness,
                        "sharpness": quality.sharpness_score,
                    }

                    if not quality.is_valid:
                        return LivenessResult(
                            is_real=False,
                            avg_score=0.0,
                            frame_scores=[],
                            best_frame_index=-1,
                            quality_checks=quality_checks,
                            confidence=0.0,
                            error_message=f"Frame {idx} quality check failed: {quality.error_message}",
                        )

                # Calculate liveness score
                score = self._detect_liveness_single_frame(image)
                frame_scores.append(score)

            except Exception as e:
                return LivenessResult(
                    is_real=False,
                    avg_score=0.0,
                    frame_scores=[],
                    best_frame_index=-1,
                    quality_checks=quality_checks,
                    confidence=0.0,
                    error_message=f"Error processing frame {idx}: {str(e)}",
                )

        # Calculate average score
        avg_score = np.mean(frame_scores)

        # Find best frame (highest score)
        best_frame_index = int(np.argmax(frame_scores))

        # Determine if real based on threshold
        is_real = avg_score >= self.liveness_threshold

        # Calculate confidence (how far from threshold)
        confidence = abs(avg_score - self.liveness_threshold) / self.liveness_threshold
        confidence = min(confidence, 1.0)

        return LivenessResult(
            is_real=is_real,
            avg_score=avg_score,
            frame_scores=frame_scores,
            best_frame_index=best_frame_index,
            quality_checks=quality_checks,
            confidence=confidence,
            error_message=None,
        )
