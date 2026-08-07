"""Regression: when the grader cannot grade, say so — never 500, never invent marks.

The one AI call that decides the OSCE grade had two failure modes sitting on opposite
sides of a single try block, and neither of them told the student the grader was down:

  * `ask()` RAISES (quota, timeout, truncation, transport) — the call at
    evaluate_response.py sits OUTSIDE the try, which catches only JSONDecodeError /
    AttributeError around `json.loads`. It propagated through the bare
    `asyncio.to_thread(evaluate_case, ...)` in the submit handler, and with no generic
    exception handler registered on the app it became a raw 500. `_persist_submit` is a
    BackgroundTask scheduled AFTER the grade, so a 15-20 minute station persisted
    NOTHING: no attempt row, no XP, no session log. The client then kept `stationActive`
    true, so leaving charged the 30-Lumen forfeit on top.

  * `ask()` returns "" (HTTP 200 with no usable content — no candidates, a safety or
    RECITATION block, thought-only parts). `json.loads("")` raised, and the fallback
    substituted score 5 across all four domains: 15/30 consultation + 15/30 judgement
    INVENTED, enough to persist a PASS with Lumens paid. Because `already_passed` then
    forces award 0 forever, the "please retry" the student was shown was worth nothing.

Both now raise GraderUnavailable and surface as 503 with nothing persisted, so a retry
is a real retry. The deterministic half of the grade needs no AI, but a partial score is
never written as an attempt — an unfinished grade must not become a permanent record.
"""
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.cases.evaluate_response import GraderUnavailable, evaluate_case
from tools.shared.jwt_utils import create_access_token


@pytest.fixture(autouse=True)
def _stub_profile_read():
    with patch("tools.shared.db.get_profile", new=AsyncMock(return_value={"role": "OA"})):
        yield


_CASE = {
    "case_id": "case_grader",
    "title": "Routine IOP check",
    "difficulty": "beginner",
    "topic": "iop_va_measurement",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "review"},
    "examination_findings": {},
    "rubric": {},
}


def _submit(es, *, ask_impl):
    """Drive a real submit with the REAL evaluate_case, stubbing only the Gemini call."""
    p = es.enter_context
    p(patch.dict("tools.api.shared._case_cache", {"case_grader": _CASE}, clear=False))
    p(patch("tools.api.routers.cases.load_case", return_value=_CASE))
    p(patch("tools.api.routers.cases.list_available_cases", return_value=["case_grader"]))
    p(patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})))
    p(patch("tools.api.routers.cases._station_checklist",
            return_value={"procedure_name": "NCT", "steps": [], "source": "checklist"}))
    p(patch("tools.api.routers.cases.db.get_case_results", new=AsyncMock(return_value=[])))
    # The three writes that must NOT happen when the grade never landed.
    completion = p(patch("tools.api.routers.cases.log_case_completion", new=AsyncMock()))
    session = p(patch("tools.api.routers.cases.log_session", new=AsyncMock()))
    profile = p(patch("tools.profile.update_profile.update_profile", new=AsyncMock()))
    # The real evaluate_case runs; only the Gemini call underneath it is stubbed.
    p(patch("tools.cases.evaluate_response.ask", new=ask_impl))

    r = TestClient(app).post(
        "/api/cases/case_grader/submit",
        json={
            "messages": [{"role": "user", "content": "Good morning, Mr Tan."}],
            "findings": "IOP within range.",
            "recommendation": "Hand over to the doctor.",
            "performed_steps": [],
        },
        cookies={"eyebot_token": create_access_token("stu_grader", "student", "OA")},
    )
    return r, completion, session, profile


def _boom(*a, **k):
    raise RuntimeError("gemini 429: quota exhausted")


def _empty(*a, **k):
    return ""


def test_a_raising_grader_is_503_and_persists_nothing():
    with ExitStack() as es:
        r, completion, session, profile = _submit(es, ask_impl=_boom)

    assert r.status_code == 503, r.text
    assert "grade" in r.json()["detail"].lower()
    # Nothing may be written: the student must be able to resubmit the same station.
    assert completion.await_count == 0
    assert session.await_count == 0
    assert profile.await_count == 0


def test_an_empty_grader_reply_does_not_fabricate_a_pass():
    """The 5/5/5/5 fallback silently invented 30 of 100 marks — enough to persist a pass
    the student could then never re-earn, because `already_passed` zeroes every retry."""
    with ExitStack() as es:
        r, completion, session, profile = _submit(es, ask_impl=_empty)

    assert r.status_code == 503, r.text
    assert completion.await_count == 0
    assert profile.await_count == 0


def test_evaluate_case_raises_rather_than_returning_invented_fives():
    """Unit-level: the fabricated score must not exist as a value evaluate_case can return."""
    for impl in (_boom, _empty):
        with patch("tools.cases.evaluate_response.ask", new=impl):
            with pytest.raises(GraderUnavailable):
                evaluate_case(_CASE, [{"role": "user", "content": "hi"}], "stu-1", [], [])


def test_a_malformed_but_present_grade_still_counts():
    """Only an ABSENT grade is unavailable. A reply that parses but omits a domain keeps
    working — the guard must not turn ordinary model sloppiness into a dead station."""
    partial = '{"history":{"score":8,"feedback":"good"},' \
              '"investigations":{"score":6,"feedback":"ok"},' \
              '"diagnosis":{"score":7,"feedback":"ok"}}'
    with patch("tools.cases.evaluate_response.ask", new=lambda *a, **k: partial):
        result = evaluate_case(_CASE, [{"role": "user", "content": "hi"}], "stu-1", [], [])
    assert result["history_score"] == 8
    assert result["management_score"] == 0  # absent domain scores zero, it is not invented
