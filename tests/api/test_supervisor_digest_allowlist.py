# tests/api/test_supervisor_digest_allowlist.py
"""Regression: the weekly digest may only be sent to a known staff address.

`recipient` came straight off the request body with no validation, so any staff token
could mail the cohort digest — student names, activity, weak topics — to an arbitrary
external address. The allow-list is the staff roster, and it fails closed.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

STAFF = [
    {"email": "coach@snec.com.sg", "role": "trainer", "status": "active"},
    {"email": "boss@snec.com.sg", "role": "admin", "status": "active"},
]


def _staff_cookie(sub: str = "stu_digest"):
    return {"eyebot_token": create_access_token(sub, "trainer", "OA")}


def test_digest_rejects_recipient_outside_staff_roster():
    with patch("tools.shared.db.get_staff_roster", new=AsyncMock(return_value=STAFF)), \
         patch("tools.api.routers.supervisor._send_digest", new=AsyncMock()) as mock_send:
        r = client.post("/api/supervisor/send-digest",
                        json={"recipient": "attacker@evil.com"},
                        cookies=_staff_cookie())
    assert r.status_code == 400
    mock_send.assert_not_called()


def test_digest_allows_a_staff_recipient():
    with patch("tools.shared.db.get_staff_roster", new=AsyncMock(return_value=STAFF)), \
         patch("tools.api.routers.supervisor._send_digest", new=AsyncMock()) as mock_send:
        r = client.post("/api/supervisor/send-digest",
                        json={"recipient": "Coach@SNEC.com.sg"},  # case-insensitive
                        cookies=_staff_cookie("stu_digest2"))
    assert r.status_code == 200
    mock_send.assert_awaited_once()


def test_digest_fails_closed_when_roster_unavailable():
    """If the allow-list can't be read, refuse — never fall through to sending."""
    with patch("tools.shared.db.get_staff_roster", new=AsyncMock(side_effect=Exception("db down"))), \
         patch("tools.api.routers.supervisor._send_digest", new=AsyncMock()) as mock_send:
        r = client.post("/api/supervisor/send-digest",
                        json={"recipient": "coach@snec.com.sg"},
                        cookies=_staff_cookie("stu_digest3"))
    assert r.status_code == 503
    mock_send.assert_not_called()


def test_digest_rejects_blank_recipient_even_with_blank_email_roster_row():
    """A blank-email roster row must never widen the allow-list to admit "".

    The gate must pin this at the handler boundary, not rely on get_staff_roster()
    upstream never returning a blank email.
    """
    roster_with_blank = [{"email": ""}, {"email": "coach@snec.com.sg"}]
    with patch("tools.shared.db.get_staff_roster", new=AsyncMock(return_value=roster_with_blank)), \
         patch("tools.api.routers.supervisor._send_digest", new=AsyncMock()) as mock_send:
        r = client.post("/api/supervisor/send-digest",
                        json={"recipient": ""},
                        cookies=_staff_cookie("stu_digest4"))
    assert r.status_code == 400
    mock_send.assert_not_called()
