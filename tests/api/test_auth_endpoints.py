# tests/api/test_auth_endpoints.py
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _auth_headers(student_id: str, role: str = "student", student_role: str = "OA") -> dict:
    """Return Authorization headers with a valid JWT for the given identity."""
    token = create_access_token(student_id, role, student_role)
    return {"Authorization": f"Bearer {token}"}


def _make_auth_row(email, plain_password, must_change=False):
    from tools.shared.auth import hash_password
    return {"email": email, "password_hash": hash_password(plain_password), "must_change": must_change}


def _make_consent_row(email, student_id, full_name):
    return {"email": email, "student_id": student_id, "full_name": full_name, "consented": "true"}


def _make_approved_row(email, role="OA"):
    return {"email": email, "full_name": "Test User", "role": role}


def test_login_success():
    auth_row = _make_auth_row("alice@test.com", "password1")
    approved_row = _make_approved_row("alice@test.com")

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_approved_students":
            return [approved_row]
        return []

    with patch("tools.api.routers.auth.get_rows_async", new=AsyncMock(side_effect=mock_get_rows)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value="stu_001"), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "alice@test.com", "password": "password1"})
    assert r.status_code == 200
    data = r.json()
    assert data["student_id"] == "stu_001"
    assert data["must_change"] is False
    assert data["is_new"] is False


def test_login_wrong_password():
    auth_row = _make_auth_row("bob@test.com", "realpass")

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_approved_students":
            return [{"email": "bob@test.com", "full_name": "Bob", "role": "OT"}]
        return []

    with patch("tools.api.routers.auth.get_rows_async", new=AsyncMock(side_effect=mock_get_rows)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)):
        r = client.post("/api/auth/login", json={"email": "bob@test.com", "password": "wrongpass"})
    assert r.status_code == 401


def test_login_not_approved():
    with patch("tools.api.routers.auth.get_rows_async", new=AsyncMock(return_value=[])):
        r = client.post("/api/auth/login", json={"email": "unknown@test.com", "password": "any"})
    assert r.status_code == 403


def test_login_student_promoted_to_supervisor():
    """Student in both approved_students and supervisors gets supervisor role."""
    auth_row = _make_auth_row("promo@test.com", "pass123")
    approved_row = _make_approved_row("promo@test.com", role="OA")
    sup_row = {"email": "promo@test.com", "role": "supervisor"}

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_approved_students":
            return [approved_row]
        if sheet == "snec_supervisors":
            return [sup_row]
        return []

    with patch("tools.api.routers.auth.get_rows_async", new=AsyncMock(side_effect=mock_get_rows)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value="stu_004"), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "promo@test.com", "password": "pass123"})
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "supervisor"
    assert data["must_change"] is False


def test_change_password_success():
    from tools.shared.auth import hash_password
    old_hash = hash_password("oldpass")
    auth_row = {"email": "carol@test.com", "password_hash": old_hash, "must_change": True}
    consent_row = {"email": "carol@test.com", "student_id": "stu_002", "full_name": "Carol"}

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_consent":
            return [consent_row]
        return []

    with patch("tools.api.routers.auth.get_rows_async", new=AsyncMock(side_effect=mock_get_rows)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()) as mock_upsert:
        r = client.post(
            "/api/auth/change-password",
            json={
                "student_id": "stu_002",
                "current_password": "oldpass",
                "new_password": "newpass123",
            },
            headers=_auth_headers("stu_002"),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_upsert.assert_called_once()


def test_change_password_wrong_current():
    from tools.shared.auth import hash_password
    old_hash = hash_password("correctpass")
    auth_row = {"email": "dave@test.com", "password_hash": old_hash, "must_change": False}
    consent_row = {"email": "dave@test.com", "student_id": "stu_003", "full_name": "Dave"}

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_consent":
            return [consent_row]
        return []

    with patch("tools.api.routers.auth.get_rows_async", new=AsyncMock(side_effect=mock_get_rows)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)):
        r = client.post(
            "/api/auth/change-password",
            json={
                "student_id": "stu_003",
                "current_password": "wrongpass",
                "new_password": "newpass123",
            },
            headers=_auth_headers("stu_003"),
        )
    assert r.status_code == 401


def test_change_password_too_short():
    # Length check fires before consent lookup; no gsheets call needed
    r = client.post(
        "/api/auth/change-password",
        json={
            "student_id": "x",
            "current_password": "any",
            "new_password": "short",
        },
        headers=_auth_headers("x"),
    )
    assert r.status_code == 400


def test_student_detail_requires_admin():
    r = client.get("/api/admin/student/stu_001/detail")
    assert r.status_code == 401  # missing Authorization header → 401


def test_student_detail_returns_shape():
    profile_data = {
        "student_id": "stu_001", "full_name": "Alice", "email": "alice@test.com",
        "role": "OA", "session_count": 3, "streak": 2, "last_active": "2026-05-27",
        "learning_velocity": "improving", "weak_topics": [], "missed_findings": [],
        "retention_scores": {}, "supervisor_note": "",
    }

    with patch("tools.api.routers.admin.get_profile", new=AsyncMock(return_value=profile_data)), \
         patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[])):
        r = client.get("/api/admin/student/stu_001/detail",
                       headers=_auth_headers("admin-uuid", "admin", ""))
    assert r.status_code == 200
    data = r.json()
    assert "sessions" in data
    assert "cases" in data
    assert "retention_scores" in data


# ---------------------------------------------------------------------------
# /api/auth/request-reset and /api/auth/reset-password
# ---------------------------------------------------------------------------

def test_request_reset_returns_ok_for_approved_user():
    """request-reset returns {"ok": True} for a known approved email."""
    approved_row = {"email": "reset@test.com", "full_name": "Reset User", "role": "OA"}

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_approved_students":
            return [approved_row]
        return []

    with patch("tools.api.routers.auth.get_rows_async", new=AsyncMock(side_effect=mock_get_rows)), \
         patch("tools.api.routers.auth.set_otp") as mock_set_otp, \
         patch("tools.shared.gmail_sender.send_email", side_effect=Exception("email disabled")):
        r = client.post("/api/auth/request-reset", json={"email": "reset@test.com"})

    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_set_otp.assert_called_once()
    assert mock_set_otp.call_args[0][0] == "reset@test.com"


def test_request_reset_returns_ok_for_unknown_email():
    """request-reset returns {"ok": True} even for unknown emails (no enumeration)."""
    with patch("tools.api.routers.auth.get_rows_async", new=AsyncMock(return_value=[])):
        r = client.post("/api/auth/request-reset", json={"email": "nobody@test.com"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_reset_password_success():
    """Valid OTP and new password updates auth row and returns {"ok": True}."""
    with patch("tools.api.routers.auth.verify_and_consume_otp", return_value=True), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()):
        r = client.post("/api/auth/reset-password", json={
            "email": "reset@test.com",
            "otp": "123456",
            "new_password": "newpassword1",
        })
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_reset_password_wrong_or_expired_otp_returns_400():
    """Invalid OTP must return 400."""
    with patch("tools.api.routers.auth.verify_and_consume_otp", return_value=False):
        r = client.post("/api/auth/reset-password", json={
            "email": "reset@test.com",
            "otp": "000000",
            "new_password": "newpassword1",
        })
    assert r.status_code == 400
    assert "Incorrect or expired" in r.json()["detail"]


def test_reset_password_too_short_returns_400():
    """Password shorter than 8 chars must return 400 even when OTP is valid."""
    with patch("tools.api.routers.auth.verify_and_consume_otp", return_value=True):
        r = client.post("/api/auth/reset-password", json={
            "email": "reset@test.com",
            "otp": "123456",
            "new_password": "short",
        })
    assert r.status_code == 400
    assert "8 characters" in r.json()["detail"]


def test_security_headers_present():
    """Every response must include security headers."""
    r = client.get("/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert r.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
