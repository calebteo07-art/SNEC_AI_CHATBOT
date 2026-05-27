# tests/api/test_auth_endpoints.py
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from tools.api.server import app

client = TestClient(app)


def _make_auth_row(email, plain_password, must_change="false"):
    from tools.shared.auth import hash_password
    return {"email": email, "password_hash": hash_password(plain_password), "must_change": must_change}


def _make_consent_row(email, student_id, full_name):
    return {"email": email, "student_id": student_id, "full_name": full_name, "consented": "true"}


def _make_approved_row(email, role="OA"):
    return {"email": email, "full_name": "Test User", "role": role}


def test_login_success():
    auth_row = _make_auth_row("alice@test.com", "password1")
    consent_row = _make_consent_row("alice@test.com", "stu_001", "Alice")
    approved_row = _make_approved_row("alice@test.com")

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_auth":
            return [auth_row]
        if sheet == "snec_consent":
            return [consent_row]
        if sheet == "snec_approved_students":
            return [approved_row]
        return []

    with patch("tools.api.server.get_rows", mock_get_rows), \
         patch("tools.api.server.get_or_create_student", return_value="stu_001"), \
         patch("tools.api.server.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "alice@test.com", "password": "password1"})
    assert r.status_code == 200
    data = r.json()
    assert data["student_id"] == "stu_001"
    assert data["must_change"] is False
    assert data["is_new"] is False


def test_login_wrong_password():
    auth_row = _make_auth_row("bob@test.com", "realpass")

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_auth":
            return [auth_row]
        if sheet == "snec_approved_students":
            return [{"email": "bob@test.com", "full_name": "Bob", "role": "OT"}]
        return []

    with patch("tools.api.server.get_rows", mock_get_rows):
        r = client.post("/api/auth/login", json={"email": "bob@test.com", "password": "wrongpass"})
    assert r.status_code == 401


def test_login_not_approved():
    with patch("tools.api.server.get_rows", return_value=[]):
        r = client.post("/api/auth/login", json={"email": "unknown@test.com", "password": "any"})
    assert r.status_code == 403


def test_login_student_promoted_to_supervisor():
    """Student in both approved_students and supervisors gets supervisor role."""
    auth_row = _make_auth_row("promo@test.com", "pass123", must_change="false")
    consent_row = _make_consent_row("promo@test.com", "stu_004", "Promo User")
    approved_row = _make_approved_row("promo@test.com", role="OA")
    sup_row = {"email": "promo@test.com", "role": "supervisor"}

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_auth":
            return [auth_row]
        if sheet == "snec_approved_students":
            return [approved_row]
        if sheet == "snec_supervisors":
            return [sup_row]
        if sheet == "snec_consent":
            return [consent_row]
        return []

    with patch("tools.api.server.get_rows", mock_get_rows), \
         patch("tools.api.server.get_or_create_student", return_value="stu_004"), \
         patch("tools.api.server.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "promo@test.com", "password": "pass123"})
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "supervisor"
    assert data["must_change"] is False


def test_change_password_success():
    from tools.shared.auth import hash_password
    old_hash = hash_password("oldpass")
    auth_row = {"email": "carol@test.com", "password_hash": old_hash, "must_change": "true"}
    consent_row = {"email": "carol@test.com", "student_id": "stu_002", "full_name": "Carol"}

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_consent":
            return [consent_row]
        if sheet == "snec_auth":
            return [auth_row]
        return []

    with patch("tools.api.server.get_rows", mock_get_rows), \
         patch("tools.api.server.update_row") as mock_update:
        r = client.post("/api/auth/change-password", json={
            "student_id": "stu_002",
            "current_password": "oldpass",
            "new_password": "newpass123",
        })
    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_update.assert_called_once()


def test_change_password_wrong_current():
    from tools.shared.auth import hash_password
    old_hash = hash_password("correctpass")
    auth_row = {"email": "dave@test.com", "password_hash": old_hash, "must_change": "false"}
    consent_row = {"email": "dave@test.com", "student_id": "stu_003", "full_name": "Dave"}

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_consent":
            return [consent_row]
        if sheet == "snec_auth":
            return [auth_row]
        return []

    with patch("tools.api.server.get_rows", mock_get_rows):
        r = client.post("/api/auth/change-password", json={
            "student_id": "stu_003",
            "current_password": "wrongpass",
            "new_password": "newpass123",
        })
    assert r.status_code == 401


def test_change_password_too_short():
    consent_row = {"email": "e@t.com", "student_id": "x", "full_name": "X"}

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_consent":
            return [consent_row]
        return []

    with patch("tools.api.server.get_rows", mock_get_rows):
        r = client.post("/api/auth/change-password", json={
            "student_id": "x",
            "current_password": "any",
            "new_password": "short",
        })
    assert r.status_code == 400


def test_student_detail_requires_admin():
    r = client.get("/api/admin/student/stu_001/detail")
    assert r.status_code == 422  # missing X-Admin-ID header


def test_student_detail_returns_shape():
    consent_row = {"email": "alice@test.com", "student_id": "stu_001", "full_name": "Alice"}

    profile_data = {
        "student_id": "stu_001", "full_name": "Alice", "email": "alice@test.com",
        "role": "OA", "session_count": "3", "streak": "2", "last_active": "2026-05-27",
        "learning_velocity": "improving", "weak_topics": "[]", "missed_findings": "[]",
        "retention_scores": "{}", "supervisor_note": "",
    }

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_consent":
            return [consent_row]
        if sheet == "snec_supervisors":
            return [{"email": "admin@snec.com", "role": "admin"}]
        if sheet == "snec_sessions":
            return []
        if sheet == "snec_case_progress":
            return []
        return []

    with patch("tools.api.server.get_rows", mock_get_rows), \
         patch("tools.api.server.get_profile", return_value=profile_data), \
         patch("tools.api.server._get_email_for_id", return_value="admin@snec.com"):
        r = client.get("/api/admin/student/stu_001/detail",
                       headers={"X-Admin-ID": "admin_x"})
    assert r.status_code == 200
    data = r.json()
    assert "sessions" in data
    assert "cases" in data
    assert "retention_scores" in data
