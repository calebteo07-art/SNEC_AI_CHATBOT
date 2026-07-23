"""Regression: /api/admin/student/{id}/insights must be rate-limited.

This endpoint fires a live, PAID Gemini call (_ai_insight_narrative → ask) — its own
docstring calls it "the (paid) AI narrative". Yet, unlike every other AI endpoint
(chat/action/chat/submit: 10-40/min), it carried no @limiter.limit, so a client loop
or a compromised staff token could hammer it and burn prod quota unbounded. This locks
in a per-user cap so a hammering caller is refused with HTTP 429.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


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
