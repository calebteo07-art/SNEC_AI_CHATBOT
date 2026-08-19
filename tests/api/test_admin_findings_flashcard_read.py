"""A failed flashcard read must not be reported as "no attempts".

`_build_student_findings`' sentences are handed VERBATIM to the AI narrative, whose
prompt tells the model to ground every claim in them. So "No flashcard attempts logged
— assign spaced-repetition decks" for a student who studied that morning is not a
cosmetic bug: the outage becomes the model's premise and a lecturer is advised to
remediate a gap that does not exist.

`tools/supervisor/cohort_reads.py` already threads exactly this flag for the cohort
path ("the only thing keeping 'unavailable' distinguishable from 'empty'"). This pins
the same split on the per-student path.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.routers.admin import _build_student_findings
from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _admin_cookie():
    # A sub of its own: /insights is rate-limited per caller and the ratelimit test
    # deliberately burns its own bucket.
    return {"eyebot_token": create_access_token("stu_fc_flag", "admin", "OA")}


def _flashcard_text(findings):
    return next(f["text"] for f in findings if f["feature"] == "Flashcards")


def test_failed_read_is_reported_as_unknown():
    text = _flashcard_text(_build_student_findings({}, [], [], {}, flashcard_ok=False))
    assert "could not be read" in text.lower()
    assert "No flashcard attempts logged" not in text


def test_a_genuinely_empty_read_still_says_no_attempts():
    """The control. Without it the fix could collapse both states onto one sentence,
    which is the same conflation in the other direction."""
    text = _flashcard_text(_build_student_findings({}, [], [], {}, flashcard_ok=True))
    assert "No flashcard attempts logged" in text


def test_insights_endpoint_threads_the_flag_into_the_narrative_input():
    """End to end on the endpoint that actually feeds the paid model. The narrative call
    is patched so this can never fire a live Gemini request, and so the exact `findings`
    list handed to it can be inspected."""
    seen = {}

    async def _fake_narrative(name, findings):
        seen["findings"] = findings
        return ""

    with patch("tools.api.routers.admin.get_profile", new=AsyncMock(return_value={"full_name": "Ann"})), \
         patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_topic_accuracy", new=AsyncMock(side_effect=Exception("read failed"))), \
         patch("tools.api.routers.admin._ai_insight_narrative", new=_fake_narrative):
        r = client.get("/api/admin/student/stu_x/insights", cookies=_admin_cookie())

    assert r.status_code == 200, r.text
    # The MODEL's input, not just the response body — that is where the lie did its damage.
    assert "could not be read" in _flashcard_text(seen["findings"]).lower()
    assert "No flashcard attempts logged" not in _flashcard_text(r.json()["findings"])
