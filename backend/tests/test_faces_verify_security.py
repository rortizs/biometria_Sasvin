from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_faces_verify_rejects_unauthenticated_identity_lookup():
    response = client.post("/api/v1/faces/verify", json={"image": "not-valid-base64"})

    assert response.status_code == 401
