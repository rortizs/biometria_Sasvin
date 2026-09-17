from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_docs_are_exposed_under_versioned_api_prefix():
    response = client.get("/api/v1/docs")

    assert response.status_code == 200
    assert "Swagger UI" in response.text
    assert "url: '/api/v1/openapi.json'" in response.text


def test_openapi_json_is_exposed_under_versioned_api_prefix():
    response = client.get("/api/v1/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "Sistema Biométrico de Asistencia — API"


def test_legacy_docs_routes_redirect_to_versioned_docs():
    response = client.get("/api/docs", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/api/v1/docs"


def test_legacy_openapi_json_remains_available_for_existing_clients():
    response = client.get("/api/openapi.json", follow_redirects=False)

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "Sistema Biométrico de Asistencia — API"
