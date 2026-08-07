"""Regression: a long station must grade, not 422 forever.

`CaseChatRequest.messages` and `CaseSubmitRequest.messages` both carried
`Field(max_length=100)`. Pydantic enforces that BEFORE the handler runs, and the client
posted the transcript unsliced, so:

  * `/chat` 422'd around the 51st patient question (each question is 2 messages), and the
    frontend turned every non-OK into `throw new Error("down")` — "(I'm having trouble
    reaching the service right now.)" forever, on a perfectly healthy service.
  * `/submit` 422'd once the combined thread passed 100 (~43 patient turns plus the
    action-panel cards), showed "submit again", and the retry sent the SAME payload —
    which had only grown. The station was permanently ungradeable, and leaving then
    charged the 30-Lumen forfeit.

`/observe` was already sliced client-side; chat and submit were simply missed.

The cap is now a truncation, not a rejection, so no client version can be locked out of
its own station — and truncation keeps the OPENING and the RECENT, because an OSCE is
graded on the history-taking at the start and the handover at the end.
"""
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.routers.cases import _KEEP_HEAD, _MAX_MESSAGES, ChatMessage, _bounded
from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

_CASE = {
    "case_id": "case_long", "title": "Red eye", "difficulty": "beginner",
    "topic": "history_triage", "role": "any", "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "red eye"},
    "examination_findings": {}, "rubric": {},
}
_DOMAINS = {
    "history_score": 8, "investigations_score": 7, "diagnosis_score": 7,
    "management_score": 8, "history_feedback": "", "investigations_feedback": "",
    "diagnosis_feedback": "", "management_feedback": "", "total_score": 30,
    "critical_hit": 1, "critical_total": 1,
}
_SCORE = {
    "score_100": 80, "total_score": 32, "verdict": "Competent",
    "checklist_coverage": 32, "checklist_coverage_max": 40,
    "consult_technique": 24, "consult_technique_max": 30,
    "judgement_safety": 24, "judgement_safety_max": 30, "safe": True,
    "missed_critical": [], "critical_hit": 1, "critical_total": 1,
    "breakdown": {
        "checklist": {"parts": [], "total": 32, "max": 40, "capped": False, "cap_reason": ""},
        "consult": {"parts": [], "total": 24, "max": 30, "capped": False, "cap_reason": ""},
        "judgement": {"parts": [], "total": 24, "max": 30, "capped": False, "cap_reason": ""},
    },
}


@pytest.fixture(autouse=True)
def _stub_profile_read():
    with patch("tools.shared.db.get_profile", new=AsyncMock(return_value={"role": "OA"})):
        yield


def _turns(n: int) -> list[dict]:
    out = []
    for i in range(n):
        out.append({"role": "user", "content": f"Question {i} about the red eye?"})
        out.append({"role": "assistant", "content": f"Answer {i}."})
    return out


def test_a_250_message_station_still_grades():
    """The old cap 422'd here — permanently, because the payload only grows."""
    seen: dict = {}

    def _capture(case, messages, student_id, performed, steps):
        seen["n"] = len(messages)
        return _DOMAINS

    with ExitStack() as es:
        p = es.enter_context
        p(patch.dict("tools.api.shared._case_cache", {"case_long": _CASE}, clear=False))
        p(patch("tools.api.routers.cases.load_case", return_value=_CASE))
        p(patch("tools.api.routers.cases.list_available_cases", return_value=["case_long"]))
        p(patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})))
        p(patch("tools.api.routers.cases._station_checklist",
                return_value={"procedure_name": "History Taking", "steps": [], "source": "checklist"}))
        p(patch("tools.api.routers.cases.evaluate_case", new=_capture))
        p(patch("tools.api.routers.cases.compute_station_score", return_value=_SCORE))
        p(patch("tools.api.routers.cases.log_session", new=AsyncMock()))
        p(patch("tools.api.routers.cases.log_case_completion", new=AsyncMock()))
        p(patch("tools.profile.update_profile.update_profile", new=AsyncMock()))
        p(patch("tools.api.routers.cases.db.get_case_results", new=AsyncMock(return_value=[])))
        p(patch("tools.api.routers.cases.ask", return_value='{"highlights":[],"did_wrong":[],"missed":[],"focus":"ok"}'))

        r = TestClient(app).post(
            "/api/cases/case_long/submit",
            json={"messages": _turns(125), "findings": "Red eye, no trauma.",
                  "recommendation": "Escalate to the doctor.",
                  "performed_steps": [], "skipped_steps": []},
            cookies={"eyebot_token": create_access_token("stu_long", "student", "OA")},
        )

    assert r.status_code == 200, r.text
    assert seen["n"] >= 250, "the whole 250-message transcript must reach the grader"


def test_beyond_the_bound_it_truncates_instead_of_rejecting():
    msgs = [ChatMessage(role="user", content=f"m{i}") for i in range(_MAX_MESSAGES + 500)]
    out = _bounded(msgs)

    assert len(out) == _MAX_MESSAGES, "the payload is bounded"
    # The opening survives — that is where history-taking is graded.
    assert [m.content for m in out[:_KEEP_HEAD]] == [f"m{i}" for i in range(_KEEP_HEAD)]
    # The handover survives — that is the other half of the grade.
    assert out[-1].content == msgs[-1].content
    # The elision is stated in-band, not hidden from the grader.
    assert "omitted" in out[_KEEP_HEAD].content


def test_at_or_below_the_bound_nothing_is_touched():
    for n in (0, 1, 100, _MAX_MESSAGES):
        msgs = [ChatMessage(role="user", content=f"m{i}") for i in range(n)]
        assert _bounded(msgs) is msgs, f"{n} messages must pass through untouched"
