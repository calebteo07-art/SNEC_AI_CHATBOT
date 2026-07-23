"""GET /api/admin/audit — admin-only read of the durable audit trail (audit_events).

The audit write paths (admin privilege, auth surface, guardrail blocks) are live once
migration 014 is applied; this endpoint is the read half. Audit data is sensitive
(actors, IPs, failed logins, privilege changes), so it is admin-only (not trainers), and
degrades to an empty list rather than 500 if the table is somehow unavailable.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _cookie(role):
    return {"eyebot_token": create_access_token("user_001", role, "OA")}


def test_audit_read_requires_auth():
    assert client.get("/api/admin/audit").status_code in (401, 403)


def test_audit_read_is_admin_only():
    # audit is sensitive — trainers (require_staff elsewhere) must NOT see it
    assert client.get("/api/admin/audit", cookies=_cookie("trainer")).status_code == 403
    assert client.get("/api/admin/audit", cookies=_cookie("student")).status_code == 403


def test_audit_read_returns_events():
    events = [{"action": "promote", "actor": "user_001", "target": "c@t.com",
               "ts": "2026-07-23T10:00:00Z", "feature": "admin", "detail": "role=trainer", "ip": "1.2.3.4"}]
    with patch("tools.shared.db.get_recent_audit_events", new=AsyncMock(return_value=events)):
        r = client.get("/api/admin/audit", cookies=_cookie("admin"))
    assert r.status_code == 200
    body = r.json()["events"]
    assert body[0]["action"] == "promote"
    assert body[0]["actor"] == "user_001"


def test_audit_read_passes_action_and_limit_filters():
    with patch("tools.shared.db.get_recent_audit_events", new=AsyncMock(return_value=[])) as mock_get:
        r = client.get("/api/admin/audit?action=login_failed&limit=25", cookies=_cookie("admin"))
    assert r.status_code == 200
    kw = mock_get.call_args.kwargs
    assert kw["action"] == "login_failed"
    assert kw["limit"] == 25


def test_audit_read_clamps_excessive_limit():
    with patch("tools.shared.db.get_recent_audit_events", new=AsyncMock(return_value=[])) as mock_get:
        r = client.get("/api/admin/audit?limit=100000", cookies=_cookie("admin"))
    assert r.status_code == 200
    assert mock_get.call_args.kwargs["limit"] <= 500   # never scan unbounded


def test_audit_read_degrades_to_empty_on_error():
    with patch("tools.shared.db.get_recent_audit_events",
               new=AsyncMock(side_effect=Exception("no table"))):
        r = client.get("/api/admin/audit", cookies=_cookie("admin"))
    assert r.status_code == 200
    assert r.json()["events"] == []
