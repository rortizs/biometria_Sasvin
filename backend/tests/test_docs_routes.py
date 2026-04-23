from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_docs_are_exposed_under_api_prefix():
    response = client.get("/api/docs")

    assert response.status_code == 200
    assert "Swagger UI" in response.text


def test_openapi_json_is_exposed_under_api_prefix():
    response = client.get("/api/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "Sistema Biométrico de Asistencia — API"
