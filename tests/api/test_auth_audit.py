"""Durable audit trail for the auth surface (reuses migration 014 audit_events).

The auth surface was completely untracked: logins (success/failure/denied), password
changes, and password resets left no durable record — the #1 forensic gap for a
multi-institution rollout (credential-stuffing, account-takeover indicators). Each now
writes an audit_events row via best-effort db.insert_audit_event. These assert the WIRING
(the call + its args), patching insert_audit_event rather than hitting the DB.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def _stub_auth_db():
    """The login path links approved_students.student_id back on a successful login.

    No test here asserts on that write, so none patched it — and it therefore WROTE to
    production approved_students on every `test_login_success_audits` run. See
    `_forbid_real_supabase` in tests/conftest.py.
    """
    with patch("tools.shared.db.update_approved", new=AsyncMock()):
        yield


def _auth_cookie(student_id: str, role: str = "student", student_role: str = "OA") -> dict:
    return {"eyebot_token": create_access_token(student_id, role, student_role)}


def _make_auth_row(email, plain_password, must_change=False):
    from tools.shared.auth import hash_password
    return {"email": email, "password_hash": hash_password(plain_password), "must_change": must_change}


def _approved(email, role="OA"):
    return {"email": email, "full_name": "Test User", "role": role}


# ── login ──────────────────────────────────────────────────────────────────────

def test_login_success_audits():
    auth_row = _make_auth_row("alice@test.com", "password1")
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=_approved("alice@test.com"))), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value=("stu_001", "Test User")), \
         patch("tools.api.routers.auth.has_consented", return_value=True), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/auth/login", json={"email": "Alice@test.com", "password": "password1"})
    assert r.status_code == 200
    audit.assert_awaited()
    kw = audit.call_args.kwargs
    assert kw["action"] == "login_success"
    assert kw["actor"] == "alice@test.com"     # normalised, from the login body
    assert kw["feature"] == "auth"


def test_login_wrong_password_audits():
    auth_row = _make_auth_row("bob@test.com", "correct-password")
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=_approved("bob@test.com"))), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/auth/login", json={"email": "bob@test.com", "password": "wrongpass"})
    assert r.status_code == 401
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "login_failed"
    assert kw["actor"] == "bob@test.com"


def test_login_not_approved_audits():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/auth/login", json={"email": "intruder@test.com", "password": "any"})
    assert r.status_code == 403
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "login_denied"
    assert kw["actor"] == "intruder@test.com"


def test_login_no_password_set_audits_denied():
    """An account that exists but was never provisioned (no hash) → a denied login too."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=_approved("unprov@test.com"))), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/auth/login", json={"email": "unprov@test.com", "password": "any"})
    assert r.status_code == 403
    audit.assert_awaited_once()
    assert audit.call_args.kwargs["action"] == "login_denied"


# ── password change ──────────────────────────────────────────────────────────────

def test_change_password_audits():
    with patch("tools.shared.db.get_consent_by_student_id",
               new=AsyncMock(return_value={"email": "carol@test.com", "student_id": "stu_9"})), \
         patch("tools.shared.db.get_auth",
               new=AsyncMock(return_value={"password_hash": "x", "must_change": True})), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/auth/change-password",
                        json={"current_password": "", "new_password": "brandnewpass1"},
                        cookies=_auth_cookie("stu_9"))
    assert r.status_code == 200
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "password_change"
    assert kw["actor"] == "stu_9"              # JWT sub, never the body


# ── password reset ───────────────────────────────────────────────────────────────

def test_reset_requested_audits():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=_approved("dave@test.com"))), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.auth.set_otp", new=MagicMock()), \
         patch("tools.shared.gmail_sender.send_email", return_value=None), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/auth/request-reset", json={"email": "dave@test.com"})
    assert r.status_code == 200
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "reset_requested"
    assert kw["actor"] == "dave@test.com"


def test_reset_requested_unknown_email_does_not_audit():
    """Unknown emails get the same non-enumerating 200 but issue no OTP → nothing to audit."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/auth/request-reset", json={"email": "ghost@test.com"})
    assert r.status_code == 200
    audit.assert_not_awaited()


def test_reset_completed_audits():
    with patch("tools.api.routers.auth.verify_and_consume_otp", new=MagicMock(return_value=True)), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/auth/reset-password",
                        json={"email": "erin@test.com", "otp": "123456", "new_password": "freshpass1"})
    assert r.status_code == 200
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "reset_completed"
    assert kw["actor"] == "erin@test.com"


def test_reset_wrong_otp_audits_failure():
    with patch("tools.api.routers.auth.verify_and_consume_otp", new=MagicMock(return_value=False)), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/auth/reset-password",
                        json={"email": "erin@test.com", "otp": "000000", "new_password": "freshpass1"})
    assert r.status_code == 400
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "reset_failed"
    assert kw["actor"] == "erin@test.com"
