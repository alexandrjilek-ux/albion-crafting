"""Smoke test — boot the app, hit /healthz, confirm 200 + payload shape."""

from fastapi.testclient import TestClient

from app import __version__
from app.main import app

client = TestClient(app)


def test_healthz_returns_200():
    resp = client.get("/healthz")
    assert resp.status_code == 200


def test_healthz_payload_shape():
    body = client.get("/healthz").json()
    assert body == {"ok": True, "version": __version__}


def test_openapi_schema_loads():
    """If a route or schema is malformed, /openapi.json explodes."""
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    paths = schema["paths"]
    # Every endpoint we wired up should appear in the schema.
    for expected in ("/healthz", "/cities", "/items/top", "/refining", "/leveling-cost", "/transport"):
        assert expected in paths, f"{expected} missing from OpenAPI"
