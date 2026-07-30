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
    # The DB lookups are mocked so the request reaches and exits the handler
    # (here as a clean 403) without needing Supabase — CI has no .env, so an
    # unmocked login would raise and never let us assert on the size guard. The
    # denied login also WRITES an audit row on the way out, so that goes too (a
    # dev box with a populated .env wrote it to production; see
    # `_forbid_real_supabase` in tests/conftest.py).
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()):
        r = client.post(
            "/api/auth/login",
            json={"email": "x@y.com", "password": "whatever"},
        )
    # May fail later for auth reasons, but must not be rejected for size.
    assert r.status_code != 413
