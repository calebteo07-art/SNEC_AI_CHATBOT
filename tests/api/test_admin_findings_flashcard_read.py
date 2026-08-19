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


def test_a_barely_seen_topic_is_not_named_the_students_weakest():
    """One wrong answer makes a 0% topic. This sentence goes VERBATIM to the AI narrative,
    so without a floor a lecturer is advised to remediate a topic the student saw twice —
    while the topic they have genuinely struggled with over 40 reviews goes unmentioned."""
    acc = {
        "tonometry": {"correct": 0, "total": 2, "pct": 0.0},     # noise
        "visual_fields": {"correct": 12, "total": 40, "pct": 30.0},  # real
    }
    text = _flashcard_text(_build_student_findings({}, [], [], acc))
    assert "visual fields" in text
    assert "tonometry" not in text, text


def test_the_denominator_is_named_as_reviews_not_cards():
    """SM-2 re-serves a missed card preferentially, so this count grows fastest for the
    students who study MOST. Calling it "cards" invited it to be read as coverage."""
    acc = {"tonometry": {"correct": 3, "total": 12, "pct": 25.0}}
    text = _flashcard_text(_build_student_findings({}, [], [], acc))
    assert "12 review(s)" in text, text
    assert "card(s)" not in text


def test_retakes_are_reported_as_attempts_and_averaged_at_the_best_attempt():
    """One student, ONE station, four attempts: 41, 55, 62, 84. This line used to read
    "4 station(s), 2 passed, avg 61/100" — attempts miscalled stations, and an
    attempt-weighted mean — while the OSCE-attainment scale inches away on the same modal
    showed 84, the best-attempt-per-station figure (D9). Three numbers, one student, one
    screen."""
    cases = [
        {"case_id": "c1", "score_100": 41, "passed": False, "safe": True},
        {"case_id": "c1", "score_100": 55, "passed": False, "safe": True},
        {"case_id": "c1", "score_100": 62, "passed": True, "safe": True},
        {"case_id": "c1", "score_100": 84, "passed": True, "safe": True},
    ]
    text = next(f["text"] for f in _build_student_findings({}, [], cases, {})
                if f["feature"] == "Virtual Patients")
    assert "4 attempt(s) across 1 station(s)" in text, text
    assert "1 station(s) passed" in text, text
    assert "best-attempt mean 84/100" in text, text


def test_an_unsafe_run_is_not_erased_by_a_later_clean_retake():
    """Safety stays over RAW attempts. The high-water rule is for attainment only —
    collapsing safety to the best attempt would erase every critical miss a student later
    recovered from, which is the one thing a trainer most needs to see."""
    cases = [
        {"case_id": "c1", "score_100": 30, "passed": False, "safe": False,
         "missed_critical": ["Confirm patient identity"]},
        {"case_id": "c1", "score_100": 90, "passed": True, "safe": True},
    ]
    text = next(f["text"] for f in _build_student_findings({}, [], cases, {})
                if f["feature"] == "Virtual Patients")
    assert "1 unsafe run(s)" in text, text
    assert "Confirm patient identity" in text, text


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
