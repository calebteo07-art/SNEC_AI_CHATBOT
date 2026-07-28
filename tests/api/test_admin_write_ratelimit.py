"""Regression: every admin WRITE endpoint must be rate-limited, per CALLER.

The read endpoints were capped (/audit 30/min, /insights 20/min) but the mutating ones —
approve, unapprove, promote, demote, CSV import — carried no cap. Each writes to the DB,
and approve/CSV additionally bcrypt-hash a password and send mail, so an unbounded loop is
both a data-integrity and a cost/quota problem.

The two DELETE writes (unapprove, demote) carry the target in the URL path. A cap added
with a plain @limiter.limit would fold that path into the bucket key (slowapi defaults to
key_style="url"), so a caller looping over different emails would get a fresh bucket per
target and never trip the counter — hence @limiter.shared_limit with a fixed scope, which
keys on the caller alone. The fixed-URL POST writes use plain @limiter.limit.

conftest resets limiter._storage between tests; each test uses a unique JWT sub so the
per-caller counter can't collide.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _admin_cookie(sub: str):
    return {"eyebot_token": create_access_token(sub, "admin", "OA")}


# ── DELETE writes: the cap must hold even across DISTINCT target emails ──────────
# (plain @limiter.limit would bucket per {email} path and never trip — see module docstring)

def test_unapprove_cap_holds_across_different_emails():
    cookie = _admin_cookie("admin_unapprove_rl")
    with patch("tools.shared.db.delete_approved", new=AsyncMock(return_value=True)), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock(return_value=None)):
        statuses = [
            client.delete(f"/api/admin/approved/user{i}@example.com", cookies=cookie).status_code
            for i in range(22)
        ]
    assert statuses[0] == 200, statuses
    assert 429 in statuses, (
        "one admin looping over distinct emails must still hit the per-user cap; "
        f"got {statuses}"
    )


def test_demote_cap_holds_across_different_emails():
    cookie = _admin_cookie("admin_demote_rl")
    with patch("tools.shared.db.delete_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock(return_value=None)):
        statuses = [
            client.delete(f"/api/admin/promote/user{i}@example.com", cookies=cookie).status_code
            for i in range(22)
        ]
    assert statuses[0] == 200, statuses
    assert 429 in statuses, (
        "one admin looping over distinct emails must still hit the per-user cap; "
        f"got {statuses}"
    )


# ── POST writes: fixed URL, plain @limiter.limit, per-caller cap ─────────────────

def test_promote_is_rate_limited_per_user():
    with patch("tools.shared.db.upsert_supervisor", new=AsyncMock()), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()):
        statuses = [
            client.post(
                "/api/admin/promote",
                json={"email": "staff@test.com", "new_role": "trainer"},
                cookies=_admin_cookie("stu_promote_rl"),
            ).status_code
            for _ in range(22)
        ]
    assert statuses[0] == 200, statuses
    assert 429 in statuses, f"expected a 429 once the per-minute cap is exceeded, got {statuses}"


def test_upload_csv_is_rate_limited_per_user():
    """Tightest cap (5/min): each row bcrypt-hashes and sends an email."""
    csv_bytes = b"full_name,email,role\n"
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_all_supervisors", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=None)):
        statuses = [
            client.post(
                "/api/admin/upload-csv",
                files={"file": ("roster.csv", csv_bytes, "text/csv")},
                cookies=_admin_cookie("stu_csv_rl"),
            ).status_code
            for _ in range(7)
        ]
    assert statuses[0] == 200, statuses
    assert 429 in statuses, f"expected a 429 once the per-minute cap is exceeded, got {statuses}"
