# tests/api/test_admin_endpoints.py
"""Security and functional tests for admin endpoints.

Two guard tiers:
  • require_staff  → read-only analytics: admin + trainer allowed, student 403.
  • require_admin  → add/remove/CSV/promote: admin only, trainer + student 403.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

# Read-only analytics endpoints — require_staff (admin + trainer)
STAFF_READ_ENDPOINTS = [
    ("GET", "/api/admin/approved"),
    ("GET", "/api/admin/students"),
    ("GET", "/api/admin/activity"),
    ("GET", "/api/admin/student/stu_x/detail"),
    ("GET", "/api/admin/token-summary"),
]

# Mutating endpoints — require_admin (admin only)
ADMIN_ONLY_ENDPOINTS = [
    ("POST",   "/api/admin/approved"),
    ("DELETE", "/api/admin/approved/test@x.com"),
    ("POST",   "/api/admin/promote"),
    ("DELETE", "/api/admin/promote/test@x.com"),
    ("POST",   "/api/admin/upload-csv"),
]

ALL_ENDPOINTS = STAFF_READ_ENDPOINTS + ADMIN_ONLY_ENDPOINTS


def _cookies(role: str, student_role: str = "OA") -> dict:
    token = create_access_token("user_001", role, student_role)
    return {"eyebot_token": token}


def _admin_headers() -> dict:
    return _cookies("admin")


def _trainer_headers() -> dict:
    return _cookies("trainer")


def _student_headers() -> dict:
    return _cookies("student")


# ---------------------------------------------------------------------------
# Auth enforcement — no token
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", ALL_ENDPOINTS)
def test_admin_endpoint_rejects_unauthenticated(method, path):
    r = client.request(method, path)
    assert r.status_code in (401, 403), f"{method} {path} → {r.status_code}"


# ---------------------------------------------------------------------------
# Auth enforcement — student rejected everywhere
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", ALL_ENDPOINTS)
def test_admin_endpoint_rejects_student_token(method, path):
    r = client.request(method, path, cookies=_student_headers())
    assert r.status_code == 403, f"{method} {path} → {r.status_code}"


# ---------------------------------------------------------------------------
# Auth enforcement — trainer: allowed on reads, 403 on mutations
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", ADMIN_ONLY_ENDPOINTS)
def test_admin_only_endpoint_rejects_trainer_token(method, path):
    """The single trainer exception: add/remove/CSV/promote stay admin-only."""
    r = client.request(method, path, cookies=_trainer_headers())
    assert r.status_code == 403, f"{method} {path} → {r.status_code}"


@pytest.mark.parametrize("method,path", STAFF_READ_ENDPOINTS)
def test_staff_read_endpoint_allows_trainer_token(method, path):
    """Trainer must pass the require_staff guard on read-only analytics endpoints.

    The DB reads aren't mocked here, so a 500 is acceptable — the point is the
    guard let the trainer through rather than returning 401/403.
    """
    r = client.request(method, path, cookies=_trainer_headers())
    assert r.status_code not in (401, 403), f"{method} {path} → {r.status_code}"


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
    assert r.json()["password"] == "TmpPass1!"
    assert r.json()["email_sent"] is True


def test_admin_approve_trainer_provisions_supervisor():
    """A staff role (Trainer/Admin) creates a supervisors row + auth credential,
    NOT an approved-students row, so a brand-new trainer can log in."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_supervisor", new=AsyncMock()) as mock_sup, \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()) as mock_appr, \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.gmail_sender.send_email", return_value=None), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "coach@test.com", "full_name": "Coach", "role": "trainer"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_sup.assert_called_once_with("coach@test.com", role="trainer")
    mock_appr.assert_not_called()


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
# Functional: promote staff (widened to trainer/admin)
# ---------------------------------------------------------------------------

def test_admin_promote_trainer_success():
    with patch("tools.shared.db.upsert_supervisor", new=AsyncMock()) as mock_sup:
        r = client.post(
            "/api/admin/promote",
            json={"email": "staff@test.com", "new_role": "trainer"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    mock_sup.assert_called_once_with("staff@test.com", role="trainer")


def test_admin_promote_invalid_role():
    # Role check fires before any DB call; no patch needed
    r = client.post(
        "/api/admin/promote",
        json={"email": "x@test.com", "new_role": "overlord"},
        cookies=_admin_headers(),
    )
    assert r.status_code == 400
