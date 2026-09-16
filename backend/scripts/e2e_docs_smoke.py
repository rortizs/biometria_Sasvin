#!/usr/bin/env python3
"""Dependency-free E2E smoke checks for FastAPI documentation routes.

The script expects a running backend and validates the canonical API v1 docs
routes plus legacy compatibility URLs.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from http.client import HTTPConnection, HTTPSConnection, HTTPResponse
from typing import Any
from urllib.parse import urljoin, urlparse

DEFAULT_BASE_URL = "http://localhost:8000"
EXPECTED_TITLE = "Sistema Biométrico de Asistencia — API"


@dataclass(frozen=True)
class Response:
    status: int
    headers: dict[str, str]
    body: bytes
    url: str

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")


def request(base_url: str, path: str) -> Response:
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise AssertionError(f"unsupported URL scheme for {url!r}")

    connection_cls = HTTPSConnection if parsed.scheme == "https" else HTTPConnection
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    host = parsed.hostname
    if not host:
        raise AssertionError(f"missing host in URL {url!r}")

    target = parsed.path or "/"
    if parsed.query:
        target = f"{target}?{parsed.query}"

    connection = connection_cls(host, port, timeout=5)
    try:
        connection.request("GET", target, headers={"Accept": "application/json,text/html"})
        raw: HTTPResponse = connection.getresponse()
        body = raw.read()
        headers = {key.lower(): value for key, value in raw.getheaders()}
        return Response(status=raw.status, headers=headers, body=body, url=url)
    finally:
        connection.close()


def assert_status(response: Response, expected: int, label: str) -> None:
    if response.status != expected:
        raise AssertionError(f"{label}: expected HTTP {expected}, got {response.status} from {response.url}")


def assert_swagger_ui(response: Response, label: str) -> None:
    text = response.text
    if "Swagger UI" not in text:
        raise AssertionError(f"{label}: response does not contain Swagger UI")
    if "/api/v1/openapi.json" not in text:
        raise AssertionError(f"{label}: response does not reference /api/v1/openapi.json")


def assert_openapi_title(response: Response, label: str) -> None:
    assert_status(response, 200, label)
    try:
        payload: dict[str, Any] = json.loads(response.text)
    except json.JSONDecodeError as exc:
        raise AssertionError(f"{label}: response is not valid JSON: {exc}") from exc

    title = payload.get("info", {}).get("title")
    if title != EXPECTED_TITLE:
        raise AssertionError(f"{label}: expected title {EXPECTED_TITLE!r}, got {title!r}")


def assert_legacy_docs(base_url: str) -> None:
    response = request(base_url, "/api/docs")
    if response.status in {301, 302, 303, 307, 308}:
        location = response.headers.get("location", "")
        if not location:
            raise AssertionError("GET /api/docs: redirect response is missing Location header")
        redirected_path = urlparse(urljoin(response.url, location)).path
        if redirected_path != "/api/v1/docs":
            raise AssertionError(
                "GET /api/docs: expected redirect to /api/v1/docs, "
                f"got {location!r}"
            )
        redirected = request(base_url, location)
        assert_status(redirected, 200, "GET /api/docs redirect target")
        assert_swagger_ui(redirected, "GET /api/docs redirect target")
        return

    assert_status(response, 200, "GET /api/docs")
    assert_swagger_ui(response, "GET /api/docs")


def run(base_url: str) -> None:
    docs = request(base_url, "/api/v1/docs")
    assert_status(docs, 200, "GET /api/v1/docs")
    assert_swagger_ui(docs, "GET /api/v1/docs")

    assert_openapi_title(request(base_url, "/api/v1/openapi.json"), "GET /api/v1/openapi.json")
    assert_legacy_docs(base_url)
    assert_openapi_title(request(base_url, "/api/openapi.json"), "GET /api/openapi.json")


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("BASE_URL", DEFAULT_BASE_URL)
    try:
        run(base_url)
    except Exception as exc:  # noqa: BLE001 - script entry point reports all smoke failures.
        print(f"E2E docs smoke failed for {base_url}: {exc}", file=sys.stderr)
        return 1

    print(f"E2E docs smoke passed for {base_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
