# tests/api/test_admin_endpoints.py
"""Security and functional tests for admin endpoints.

Critical security invariant: every admin endpoint must enforce JWT auth AND
require the 'admin' role — a student or supervisor JWT must be rejected.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

ADMIN_ENDPOINTS = [
    ("GET",    "/api/admin/approved"),
    ("POST",   "/api/admin/approved"),
    ("DELETE", "/api/admin/approved/test@x.com"),
    ("GET",    "/api/admin/students"),
    ("POST",   "/api/admin/promote"),
    ("GET",    "/api/admin/activity"),
    ("POST",   "/api/admin/upload-csv"),
    ("GET",    "/api/admin/token-summary"),
]


def _cookies(role: str, student_role: str = "OA") -> dict:
    token = create_access_token("user_001", role, student_role)
    return {"eyebot_token": token}


def _admin_headers() -> dict:
    return _cookies("admin")


def _student_headers() -> dict:
    return _cookies("student")


def _supervisor_headers() -> dict:
    return _cookies("supervisor")


# ---------------------------------------------------------------------------
# Auth enforcement — no token
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
def test_admin_endpoint_rejects_unauthenticated(method, path):
    """Every admin endpoint returns 401/403 with no token."""
    r = client.request(method, path)
    assert r.status_code in (401, 403), f"{method} {path} → {r.status_code}"


# ---------------------------------------------------------------------------
# Auth enforcement — wrong role
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
def test_admin_endpoint_rejects_student_token(method, path):
    """Every admin endpoint returns 403 when called with a student JWT."""
    r = client.request(method, path, cookies=_student_headers())
    assert r.status_code == 403, f"{method} {path} → {r.status_code}"


@pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
def test_admin_endpoint_rejects_supervisor_token(method, path):
    """Every admin endpoint returns 403 when called with a supervisor JWT."""
    r = client.request(method, path, cookies=_supervisor_headers())
    assert r.status_code == 403, f"{method} {path} → {r.status_code}"


# ---------------------------------------------------------------------------
# Functional: list approved students
# ---------------------------------------------------------------------------

def test_admin_list_approved_returns_students():
    rows = [
        {"email": "a@test.com", "full_name": "Alice", "role": "OA"},
        {"email": "b@test.com", "full_name": "Bob",   "role": "OT"},
    ]
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=rows)):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 200
    assert len(r.json()["students"]) == 2


def test_admin_list_approved_returns_empty_list():
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=[])):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 200
    assert r.json()["students"] == []


def test_admin_list_approved_500_on_sheets_failure():
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(side_effect=Exception("db down"))):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 500
    assert "db down" not in r.json()["detail"]


# ---------------------------------------------------------------------------
# Functional: approve one student
# ---------------------------------------------------------------------------

def test_admin_approve_student_success():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.gmail_sender.send_email", return_value=None), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "new@test.com", "full_name": "New User", "role": "OA"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    # The temp password is returned to the authenticated admin as an email-delivery
    # fallback (mirrors the CSV import). Admin-role auth is enforced by the
    # rejects_unauthenticated/student/supervisor tests above.
    assert r.json()["password"] == "TmpPass1!"
    assert r.json()["email_sent"] is True


def test_admin_approve_student_409_duplicate():
    existing = {"email": "dup@test.com", "full_name": "Dup", "role": "OA"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=existing)):
        r = client.post(
            "/api/admin/approved",
            json={"email": "dup@test.com", "full_name": "Dup", "role": "OA"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 409


def test_admin_approve_student_400_empty_email():
    r = client.post(
        "/api/admin/approved",
        json={"email": "   ", "full_name": "X", "role": "OA"},
        cookies=_admin_headers(),
    )
    assert r.status_code == 400


def test_admin_approve_student_returns_temp_password_when_email_fails():
    """When email delivery fails, the account is still created and the temp
    password is returned so an authenticated admin can share it manually —
    otherwise a broken SMTP setup would block all onboarding. Admin-role auth is
    enforced by the rejects_unauthenticated/student/supervisor tests above."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.gmail_sender.send_email", side_effect=Exception("smtp down")), \
         patch("tools.api.routers.admin.generate_password", return_value="SuperSecret1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "safe@test.com", "full_name": "Safe User", "role": "OT"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["email_sent"] is False
    assert r.json()["password"] == "SuperSecret1!"


# ---------------------------------------------------------------------------
# Functional: remove student
# ---------------------------------------------------------------------------

def test_admin_remove_student_success():
    with patch("tools.shared.db.delete_approved", new=AsyncMock(return_value=True)):
        r = client.delete("/api/admin/approved/gone@test.com", cookies=_admin_headers())
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_admin_remove_student_404_not_found():
    with patch("tools.shared.db.delete_approved", new=AsyncMock(return_value=False)):
        r = client.delete("/api/admin/approved/nobody@test.com", cookies=_admin_headers())
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Functional: promote staff
# ---------------------------------------------------------------------------

def test_admin_promote_success():
    with patch("tools.shared.db.upsert_supervisor", new=AsyncMock()):
        r = client.post(
            "/api/admin/promote",
            json={"email": "staff@test.com", "new_role": "supervisor"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200


def test_admin_promote_invalid_role():
    # Role check fires before any DB call; no patch needed
    r = client.post(
        "/api/admin/promote",
        json={"email": "x@test.com", "new_role": "overlord"},
        cookies=_admin_headers(),
    )
    assert r.status_code == 400
