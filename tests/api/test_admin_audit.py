"""Durable audit trail for admin privilege-lifecycle actions (migration 014).

Every access/authority change — approve student, create staff, promote, demote,
unapprove — must write a durable audit_events row via db.insert_audit_event, attributed
to the acting admin (JWT sub, never the body). Previously these mutated access/authority
with zero attribution. Audit is best-effort, so these assert the WIRING (the call + its
args), patching db.insert_audit_event rather than hitting the DB.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _admin() -> dict:
    return {"eyebot_token": create_access_token("user_001", "admin", "OA")}


def _approve_stubs():
    """Stub every DB/side-effect the approve path touches so only the audit call is real."""
    return patch.multiple(
        "tools.shared.db",
        get_approved=AsyncMock(return_value=None),
        get_supervisor=AsyncMock(return_value=None),  # duplicate guard: no existing staff row
        get_consent_by_student_id=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"}),
        upsert_approved=AsyncMock(),
        upsert_supervisor=AsyncMock(),
        upsert_auth=AsyncMock(),
        get_consent_by_email=AsyncMock(return_value=None),
        upsert_consent=AsyncMock(),
        update_consent=AsyncMock(),
    )


def test_promote_writes_audit_event():
    with patch("tools.shared.db.upsert_supervisor", new=AsyncMock()), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/admin/promote",
                        json={"email": "Coach@test.com", "new_role": "trainer"},
                        cookies=_admin())
    assert r.status_code == 200
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "promote"
    assert kw["actor"] == "user_001"            # JWT sub, never the request body
    assert kw["target"] == "coach@test.com"
    assert "trainer" in kw["detail"]


def test_demote_writes_audit_event():
    with patch("tools.shared.db.delete_supervisor", new=AsyncMock()), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.delete("/api/admin/promote/Coach@test.com", cookies=_admin())
    assert r.status_code == 200
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "demote"
    assert kw["actor"] == "user_001"
    assert kw["target"] == "coach@test.com"


def test_unapprove_writes_audit_event():
    with patch("tools.shared.db.delete_approved", new=AsyncMock(return_value=True)), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.delete("/api/admin/approved/Stu@test.com", cookies=_admin())
    assert r.status_code == 200
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "unapprove_student"
    assert kw["target"] == "stu@test.com"


def test_unapprove_404_does_not_audit():
    """The audit call must sit AFTER the 404 guard — a no-op delete records nothing."""
    with patch("tools.shared.db.delete_approved", new=AsyncMock(return_value=False)), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.delete("/api/admin/approved/ghost@test.com", cookies=_admin())
    assert r.status_code == 404
    audit.assert_not_awaited()


def test_approve_student_writes_audit_event():
    with _approve_stubs(), \
         patch("tools.shared.gmail_sender.send_email", return_value=None), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/admin/approved",
                        json={"email": "New@test.com", "full_name": "New User", "role": "OA"},
                        cookies=_admin())
    assert r.status_code == 200
    audit.assert_awaited_once()
    kw = audit.call_args.kwargs
    assert kw["action"] == "approve_student"
    assert kw["actor"] == "user_001"
    assert kw["target"] == "new@test.com"


def test_approve_staff_audits_as_create_staff():
    """Creating a trainer/admin is a privilege grant — audited distinctly from a student."""
    with _approve_stubs(), \
         patch("tools.shared.gmail_sender.send_email", return_value=None), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()) as audit:
        r = client.post("/api/admin/approved",
                        json={"email": "Coach@test.com", "full_name": "Coach", "role": "trainer"},
                        cookies=_admin())
    assert r.status_code == 200
    kw = audit.call_args.kwargs
    assert kw["action"] == "create_staff"
    assert kw["target"] == "coach@test.com"
    assert "trainer" in kw["detail"].lower()   # handler uppercases the role code
