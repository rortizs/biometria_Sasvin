import base64
import io

import pytest
from PIL import Image

from app.services.face_recognition import FaceRecognitionService


def _image_b64(*, size=(1, 1), image_format="PNG") -> str:
    image = Image.new("RGB", size, color=(255, 255, 255))
    buf = io.BytesIO()
    image.save(buf, format=image_format)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_decode_rejects_malformed_base64_before_face_recognition():
    service = FaceRecognitionService()

    with pytest.raises(ValueError, match="Invalid image payload"):
        service.decode_base64_image("not-valid-base64!!!")


def test_decode_rejects_disallowed_image_format_before_face_recognition():
    service = FaceRecognitionService()

    with pytest.raises(ValueError, match="Unsupported image format"):
        service.decode_base64_image(_image_b64(image_format="GIF"))


def test_decode_rejects_oversized_image_dimensions_before_face_recognition():
    service = FaceRecognitionService()

    with pytest.raises(ValueError, match="Image dimensions exceed"):
        service.decode_base64_image(_image_b64(size=(5001, 1)))
