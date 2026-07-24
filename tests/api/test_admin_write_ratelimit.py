"""Regression: the admin DELETE writes must be rate-limited per CALLER, not per {email}.

DELETE /api/admin/approved/{email} (unapprove) and DELETE /api/admin/promote/{email}
(demote) are destructive privilege writes that carry the target in the URL path. A cap
added with a plain @limiter.limit would fold that path into the bucket key (slowapi
defaults to key_style="url"), so a caller looping over different emails would get a fresh
bucket per target and never trip the counter. @limiter.shared_limit pins the bucket to a
fixed scope, so the cap keys on the caller alone — hammering distinct emails is still
refused with HTTP 429.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def test_unapprove_cap_holds_across_different_emails():
    # unique sub so this caller's counter can't collide with other tests
    cookie = {"eyebot_token": create_access_token("admin_unapprove_rl", "admin", "OA")}
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
    cookie = {"eyebot_token": create_access_token("admin_demote_rl", "admin", "OA")}
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
