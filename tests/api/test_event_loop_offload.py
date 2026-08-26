"""Event-loop offload regressions (bug hunt ranks 5, 6, 8, 21).

Prod runs ONE uvicorn worker; a blocking call made directly in an async handler
freezes every concurrent request/SSE stream (production invariant #1). Each fix
wraps the blocking call in ``asyncio.to_thread``. A function dispatched via
to_thread runs in a worker thread that has NO running event loop, so
``asyncio.get_running_loop()`` raises there — that is what these tests assert.
"""
import asyncio

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _cookie():
    return {"eyebot_token": create_access_token("stu_test", "student", "OA")}


def _probe(store: dict, return_value=None):
    """A fake callable that records whether it ran on the event-loop thread."""
    def _fake(*_a, **_k):
        try:
            asyncio.get_running_loop()
            store["on_loop"] = True
        except RuntimeError:
            store["on_loop"] = False
        return return_value
    return _fake


CASE = {
    "case_id": "case_test_station",
    "title": "Test NCT",
    "difficulty": "beginner",
    "topic": "nct_glaucoma_suspect",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "review"},
    "rubric": {"history": {"key_points": ["Ask compliance"]}},
}
_FAKE_CL = {"procedure_name": "NCT", "steps": [], "source": "checklist"}


def test_observe_offloads_station_checklist():
    """rank 5: /observe fires every consult turn; the sync Supabase checklist
    fetch must not run on the loop."""
    seen: dict = {}
    with patch.dict("tools.api.shared._case_cache", {"case_test_station": CASE}, clear=False), \
         patch("tools.api.routers.cases._station_checklist", side_effect=_probe(seen, _FAKE_CL)), \
         patch("tools.api.routers.cases.observe", return_value=[]):
        client.post(
            "/api/cases/case_test_station/observe",
            json={"messages": [{"role": "user", "content": "hi"}], "already_ticked": []},
            cookies=_cookie(),
        )
    assert seen.get("on_loop") is False


def test_action_offloads_station_checklist():
    """rank 5: /action resolves the same checklist off the loop."""
    seen: dict = {}
    with patch.dict("tools.api.shared._case_cache", {"case_test_station": CASE}, clear=False), \
         patch("tools.api.routers.cases._station_checklist", side_effect=_probe(seen, _FAKE_CL)), \
         patch("tools.api.routers.cases.ask", side_effect=RuntimeError("no ai")):
        client.post(
            "/api/cases/case_test_station/action",
            json={"action_label": "Measure IOP", "technique": "x" * 12, "finding": "", "satisfies_steps": [2]},
            cookies=_cookie(),
        )
    assert seen.get("on_loop") is False


def test_chat_offloads_context_cache_create():
    """rank 8: a tutor context-cache miss does a blocking caches.create()."""
    seen: dict = {}
    # stream_ask must be stubbed too: this test only cares that the CACHE call is
    # offloaded, but the request runs on to the tutor stream afterwards. Left real, it
    # was the one remaining test that fired a live, billable Gemini call on any machine
    # with a key in .env — the same omission as the insights rate-limit tests.
    with patch("tools.api.routers.chat.get_profile", new=AsyncMock(return_value={"role": "OA"})), \
         patch("tools.api.routers.chat.filter_input", new=AsyncMock(return_value={"safe": True, "reason": ""})), \
         patch("tools.api.shared._student_context_block", new=AsyncMock(return_value="")), \
         patch("tools.api.routers.chat.stream_ask", return_value=iter(())), \
         patch("tools.api.routers.chat.get_or_create_context_cache", side_effect=_probe(seen, None)):
        client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "what is glaucoma"}]},
            cookies=_cookie(),
        )
    assert seen.get("on_loop") is False


def test_weekly_digest_offloads_send_email():
    """rank 6: a slow email provider must not freeze the worker for 15s."""
    from tools.supervisor import weekly_digest
    seen: dict = {}
    with patch.object(weekly_digest, "build_digest_html", new=AsyncMock(return_value="<html>")), \
         patch.object(weekly_digest, "send_email", side_effect=_probe(seen)):
        asyncio.run(weekly_digest.send_weekly_digest("sup@test.com"))
    assert seen.get("on_loop") is False


def test_generate_report_offloads_pdf_build():
    """rank 21: reportlab's blocking doc.build must run off the loop."""
    from tools.supervisor import generate_report
    seen: dict = {}

    class _FakeDoc:
        def __init__(self, *a, **k):
            pass

        def build(self, elements):
            try:
                asyncio.get_running_loop()
                seen["on_loop"] = True
            except RuntimeError:
                seen["on_loop"] = False

    profile = {
        "role": "OA", "weak_topics": [], "retention_scores": {}, "supervisor_note": "",
        "session_count": 0, "streak": 0, "last_active": "—", "learning_velocity": "stable",
    }
    with patch.object(generate_report, "get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"student_name": "X", "email": "x@y.com"})), \
         patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[])), \
         patch.object(generate_report, "SimpleDocTemplate", _FakeDoc):
        asyncio.run(generate_report.generate_student_report("stu_test", benchmarks=[]))
    assert seen.get("on_loop") is False
