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


def _headers(role: str, student_role: str = "OA") -> dict:
    token = create_access_token("user_001", role, student_role)
    return {"Authorization": f"Bearer {token}"}


def _admin_headers() -> dict:
    return _headers("admin")


def _student_headers() -> dict:
    return _headers("student")


def _supervisor_headers() -> dict:
    return _headers("supervisor")


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
    r = client.request(method, path, headers=_student_headers())
    assert r.status_code == 403, f"{method} {path} → {r.status_code}"


@pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
def test_admin_endpoint_rejects_supervisor_token(method, path):
    """Every admin endpoint returns 403 when called with a supervisor JWT."""
    r = client.request(method, path, headers=_supervisor_headers())
    assert r.status_code == 403, f"{method} {path} → {r.status_code}"


# ---------------------------------------------------------------------------
# Functional: list approved students
# ---------------------------------------------------------------------------

def test_admin_list_approved_returns_students():
    rows = [
        {"email": "a@test.com", "full_name": "Alice", "role": "OA"},
        {"email": "b@test.com", "full_name": "Bob",   "role": "OT"},
    ]
    with patch("tools.api.routers.admin.get_rows_async", new=AsyncMock(return_value=rows)):
        r = client.get("/api/admin/approved", headers=_admin_headers())
    assert r.status_code == 200
    assert len(r.json()["students"]) == 2


def test_admin_list_approved_returns_empty_list():
    with patch("tools.api.routers.admin.get_rows_async", new=AsyncMock(return_value=[])):
        r = client.get("/api/admin/approved", headers=_admin_headers())
    assert r.status_code == 200
    assert r.json()["students"] == []


def test_admin_list_approved_500_on_sheets_failure():
    with patch("tools.api.routers.admin.get_rows_async", new=AsyncMock(side_effect=Exception("sheets down"))):
        r = client.get("/api/admin/approved", headers=_admin_headers())
    assert r.status_code == 500
    assert "sheets down" not in r.json()["detail"]


# ---------------------------------------------------------------------------
# Functional: approve one student
# ---------------------------------------------------------------------------

def _mock_get_rows_no_existing(sheet, filters=None):
    if sheet == "snec_consent":
        return [{"email": "admin@test.com", "student_id": "user_001"}]
    return []


def test_admin_approve_student_success():
    with patch("tools.api.routers.admin.get_rows_async", new=AsyncMock(side_effect=_mock_get_rows_no_existing)), \
         patch("tools.api.routers.admin.append_row_async", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "new@test.com", "full_name": "New User", "role": "OA"},
            headers=_admin_headers(),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert "password" not in r.json()


def test_admin_approve_student_409_duplicate():
    existing = [{"email": "dup@test.com", "full_name": "Dup", "role": "OA"}]

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_approved_students":
            return existing
        return []

    with patch("tools.api.routers.admin.get_rows_async", new=AsyncMock(side_effect=mock_get_rows)):
        r = client.post(
            "/api/admin/approved",
            json={"email": "dup@test.com", "full_name": "Dup", "role": "OA"},
            headers=_admin_headers(),
        )
    assert r.status_code == 409


def test_admin_approve_student_400_empty_email():
    with patch("tools.api.routers.admin.get_rows_async", new=AsyncMock(return_value=[])):
        r = client.post(
            "/api/admin/approved",
            json={"email": "   ", "full_name": "X", "role": "OA"},
            headers=_admin_headers(),
        )
    assert r.status_code == 400


def test_admin_approve_student_does_not_return_password():
    """Plaintext password must never appear in the API response."""
    with patch("tools.api.routers.admin.get_rows_async", new=AsyncMock(side_effect=_mock_get_rows_no_existing)), \
         patch("tools.api.routers.admin.append_row_async", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.api.routers.admin.generate_password", return_value="SuperSecret1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "safe@test.com", "full_name": "Safe User", "role": "OT"},
            headers=_admin_headers(),
        )
    assert "SuperSecret1!" not in r.text
    assert "password" not in r.json()


# ---------------------------------------------------------------------------
# Functional: remove student
# ---------------------------------------------------------------------------

def test_admin_remove_student_success():
    with patch("tools.shared.gsheets.delete_row", return_value=True):
        r = client.delete("/api/admin/approved/gone@test.com", headers=_admin_headers())
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_admin_remove_student_404_not_found():
    with patch("tools.shared.gsheets.delete_row", return_value=False):
        r = client.delete("/api/admin/approved/nobody@test.com", headers=_admin_headers())
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Functional: promote staff
# ---------------------------------------------------------------------------

def test_admin_promote_success():
    def mock_get_rows(sheet, filters=None):
        return []  # no existing supervisor → triggers append

    with patch("tools.api.routers.admin.get_rows_async", new=AsyncMock(side_effect=mock_get_rows)), \
         patch("tools.api.routers.admin.append_row_async", new=AsyncMock()):
        r = client.post(
            "/api/admin/promote",
            json={"email": "staff@test.com", "new_role": "supervisor"},
            headers=_admin_headers(),
        )
    assert r.status_code == 200


def test_admin_promote_invalid_role():
    # Role check fires before any DB call; patch included for safety
    with patch("tools.api.routers.admin.get_rows_async", new=AsyncMock(return_value=[])):
        r = client.post(
            "/api/admin/promote",
            json={"email": "x@test.com", "new_role": "overlord"},
            headers=_admin_headers(),
        )
    assert r.status_code == 400
