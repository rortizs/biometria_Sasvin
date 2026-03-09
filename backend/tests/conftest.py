"""
Pytest configuration and fixtures.
"""

import sys
from unittest.mock import MagicMock

# Mock face_recognition BEFORE any imports that use it
# This prevents face_recognition from trying to import pkg_resources during test collection
face_recognition_mock = MagicMock()
sys.modules["face_recognition"] = face_recognition_mock
sys.modules["face_recognition.api"] = MagicMock()
