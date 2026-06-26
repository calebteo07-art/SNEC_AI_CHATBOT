"""A single oversized request must not be able to exhaust the instance.

The size guard runs as middleware, before routing and rate limiting, so it
rejects with 413 regardless of the target path.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app

client = TestClient(app)


def test_oversized_request_body_rejected(monkeypatch):
    monkeypatch.setattr("tools.api.server.MAX_REQUEST_BYTES", 50)
    r = client.post(
        "/api/auth/login",
        content="x" * 500,
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 413


def test_normal_request_body_not_size_rejected(monkeypatch):
    monkeypatch.setattr("tools.api.server.MAX_REQUEST_BYTES", 2_000_000)
    # Mock the DB boundary so the request reaches the route deterministically —
    # otherwise login calls Supabase, which raises without creds (CI has none) and
    # the size assertion never runs. This test is about the size middleware only;
    # an unknown email yields a clean 403, which is the "may fail for auth" case.
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)):
        r = client.post(
            "/api/auth/login",
            json={"email": "x@y.com", "password": "whatever"},
        )
    # May fail later for auth reasons (403 here), but must not be rejected for size.
    assert r.status_code != 413
