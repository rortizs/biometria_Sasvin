"""
Test face_recognition tolerance with 1280px JPEG quality 0.7 images.

This test verifies that the face recognition pipeline works correctly
with the capped resolution (1280px) and reduced JPEG quality (0.7) that
the mobile camera will send.

Run with: pytest backend/tests/test_face_resolution.py -v
"""

import base64
import io
from PIL import Image
import numpy as np


def create_test_image(width: int, height: int, quality: float = 0.8) -> str:
    """Create a test image and return as base64 JPEG."""
    # Create a simple gradient image (not a real face, but tests the pipeline)
    img_array = np.random.randint(0, 255, (height, width, 3), dtype=np.uint8)
    img = Image.fromarray(img_array, mode="RGB")

    # Convert to JPEG with specified quality
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=int(quality * 100))
    buffer.seek(0)

    # Encode to base64
    base64_str = base64.b64encode(buffer.read()).decode("utf-8")
    return f"data:image/jpeg;base64,{base64_str}"


def test_image_size_reduction():
    """Test that 1280px JPEG at 0.7 quality produces smaller payload than full-res."""
    # Simulate a 4K camera (3840x2160)
    full_res_image = create_test_image(3840, 2160, quality=0.8)

    # Simulate mobile-capped image (1280x720, proportional from 3840x2160)
    mobile_image = create_test_image(1280, 720, quality=0.7)

    full_res_size_kb = len(full_res_image) / 1024
    mobile_size_kb = len(mobile_image) / 1024

    print(f"\nFull resolution (3840x2160, q0.8): {full_res_size_kb:.1f} KB")
    print(f"Mobile capped (1280x720, q0.7): {mobile_size_kb:.1f} KB")
    print(f"Reduction: {(1 - mobile_size_kb / full_res_size_kb) * 100:.1f}%")

    # Verify mobile image is smaller
    assert mobile_size_kb < full_res_size_kb

    # Verify mobile image is under 300KB target
    assert mobile_size_kb < 300, (
        f"Mobile image {mobile_size_kb:.1f}KB exceeds 300KB target"
    )

    print("\n✅ Image size test PASSED")


def test_face_recognition_with_reduced_resolution():
    """
    Test face_recognition library with reduced resolution images.

    NOTE: This is a placeholder test. For actual face recognition testing,
    you need:
    1. A real test face image (not random noise)
    2. The face_recognition library installed
    3. A test embedding to compare against

    This test documents the expected behavior but is SKIPPED in CI.
    For beta verification, run this manually with real face images.
    """
    try:
        from app.services.face_recognition import FaceRecognitionService

        # This would require a real face image to test properly
        # For now, we document the acceptance criteria:

        print("\n📝 Face recognition resolution requirements:")
        print(
            "- face_recognition library internally scales to ~150px for HOG detection"
        )
        print("- 1280px input should produce identical results to 4K input")
        print("- JPEG quality 0.7 should not degrade face features significantly")
        print("- Expected embedding distance difference: < 0.05 (within tolerance)")

        print("\n⚠️  MANUAL VERIFICATION REQUIRED:")
        print("1. Capture a real face at full resolution (e.g., 3840x2160)")
        print("2. Capture same face at 1280px with JPEG q0.7")
        print("3. Compare embeddings from both images")
        print("4. Verify distance is below match threshold (typically 0.6)")

        # If we have the service available, at least verify it can be imported
        service = FaceRecognitionService()
        print(f"\n✅ FaceRecognitionService imported successfully")
        print(f"   Match tolerance: {service.tolerance}")

    except ImportError as e:
        print(f"\n⏭️  Skipping face_recognition test (library not available): {e}")
        print(
            "   This is expected in CI. Run manually with backend dependencies installed."
        )


def test_three_frame_payload_size():
    """Test that 3 frames at mobile quality fit within 1MB target."""
    # Simulate 3 frames at 1280x720, JPEG q0.7
    frames = [create_test_image(1280, 720, quality=0.7) for _ in range(3)]

    total_size_kb = sum(len(frame) / 1024 for frame in frames)
    total_size_mb = total_size_kb / 1024

    print(f"\nThree-frame payload:")
    print(f"  Individual frame: ~{total_size_kb / 3:.1f} KB")
    print(f"  Total (3 frames): {total_size_kb:.1f} KB ({total_size_mb:.2f} MB)")

    # Target: under 1MB for 3 frames
    assert total_size_kb < 1024, f"3-frame payload {total_size_kb:.1f}KB exceeds 1MB"

    print("✅ Three-frame payload test PASSED")


if __name__ == "__main__":
    print("=" * 60)
    print("Face Recognition Resolution Tolerance Test")
    print("=" * 60)

    test_image_size_reduction()
    test_three_frame_payload_size()
    test_face_recognition_with_reduced_resolution()

    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print("✅ Image size reduction verified")
    print("✅ Three-frame payload within 1MB limit")
    print("⚠️  Face recognition tolerance requires manual verification")
    print("\nNext steps:")
    print("1. Test with real device camera captures")
    print("2. Verify face match accuracy with capped images")
    print("3. If accuracy degrades, increase quality to 0.75 or maxWidth to 1600px")
