"""Regression: /api/admin/student/{id}/insights must be rate-limited.

This endpoint fires a live, PAID Gemini call (_ai_insight_narrative → ask) — its own
docstring calls it "the (paid) AI narrative". Yet, unlike every other AI endpoint
(chat/action/chat/submit: 10-40/min), it carried no @limiter.limit, so a client loop
or a compromised staff token could hammer it and burn prod quota unbounded. This locks
in a per-user cap so a hammering caller is refused with HTTP 429.
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def _stub_insight_ai():
    """Stub the paid narrative call.

    Both tests below deliberately issue 22 requests to prove a 20/minute cap, and 20 of
    those get past the limiter into ``_ai_insight_narrative`` → ``ask``. On any machine
    with a real GEMINI_API_KEY in .env that was **40 live, billable Gemini calls every
    time the suite ran** — this file burning the exact prod quota it was written to
    protect. ``ask`` is patched where admin.py binds it (a from-import, so the module
    attribute is the seam).
    """
    with patch("tools.api.routers.admin.ask", return_value="stubbed insight"):
        yield


def _staff_cookie():
    # unique sub so the per-caller limiter count can't collide with other tests
    return {"eyebot_token": create_access_token("stu_insights_rl", "admin", "OA")}


def test_student_insights_is_rate_limited_per_user():
    with patch("tools.api.routers.admin.get_profile", new=AsyncMock(return_value={"full_name": "Ann"})), \
         patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_topic_accuracy", new=AsyncMock(return_value={})):
        statuses = [
            client.get("/api/admin/student/stu_x/insights", cookies=_staff_cookie()).status_code
            for _ in range(22)
        ]
    assert statuses[0] == 200, statuses
    assert 429 in statuses, f"expected a 429 once the per-minute cap is exceeded, got {statuses}"


def test_student_insights_cap_holds_across_different_student_ids():
    """The cap must key on the CALLER, not the {student_id} in the URL.

    slowapi's Limiter defaults to key_style="url", so a plain @limiter.limit puts the
    request path into the bucket key. With {student_id} in the path, a caller who loops
    over MANY different ids gets a fresh bucket per id and never trips the counter — yet
    every one of those requests still fires the paid Gemini narrative. Hammering distinct
    ids (not one repeated id, which the test above already covers) must still be refused
    with a 429. @limiter.shared_limit pins the bucket to a fixed scope, restoring this.
    """
    cookie = {"eyebot_token": create_access_token("stu_insights_rl_multi", "admin", "OA")}
    with patch("tools.api.routers.admin.get_profile", new=AsyncMock(return_value={"full_name": "Ann"})), \
         patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_topic_accuracy", new=AsyncMock(return_value={})):
        statuses = [
            client.get(f"/api/admin/student/stu_{i}/insights", cookies=cookie).status_code
            for i in range(22)
        ]
    assert statuses[0] == 200, statuses
    assert 429 in statuses, (
        "one caller looping over distinct student_ids must still hit the per-user cap; "
        f"got {statuses}"
    )
