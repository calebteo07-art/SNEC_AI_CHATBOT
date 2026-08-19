"""GET /api/study-suggestion must stay inside the student's role scope.

`weak_topics` is derived from retention_scores, which mixes TWO namespaces: the closed
flashcard topic namespace, and raw OSCE case topics written server-side by cases.py.
Quests already guard against this (tools/gamification/quests.py); study-suggestion did
not, so an OT student could be coached to revise a CLINICAL topic they own no decks for,
and either role could be handed a raw case slug as their focus.

`ask` is patched in every test — no live Gemini call, and the patch also lets these
assert on the prompt the coach is actually given, not just the returned focus.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

# Real keys. `glaucoma` is FOUNDATIONS (every role); `distance_va` is CLINICAL (OA/PSA);
# `hvf` is OT-only. `Cirrus_Oct_Macular_Scan` is a raw OSCE case topic — no role studies
# it as a flashcard topic.
MIXED = ["distance_va", "Cirrus_Oct_Macular_Scan", "hvf", "glaucoma"]


def _cookies(sub: str = "ann") -> dict:
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


def _profile(role: str, weak: list[str]) -> dict:
    return {"student_id": "ann", "role": role, "weak_topics": weak,
            "streak": 3, "session_count": 12, "learning_velocity": "stable"}


def _call(role: str, weak: list[str]):
    """Returns (response_json, the kwargs `ask` was called with)."""
    spy = MagicMock(return_value="Revise it today.")
    with patch("tools.api.routers.student.get_profile",
               AsyncMock(return_value=_profile(role, weak))), \
         patch("tools.api.routers.student.ask", spy):
        r = client.get("/api/study-suggestion", cookies=_cookies())
    assert r.status_code == 200
    return r.json(), spy.call_args.kwargs


def test_requires_auth():
    assert client.get("/api/study-suggestion").status_code == 401


def test_ot_focus_skips_the_clinical_topic():
    """The bug: focus was weak[0] unconditionally, so this returned `distance_va` —
    a topic an OT has no deck for."""
    body, _ = _call("OT", MIXED)
    assert body["focus_topic"] == "hvf"


def test_clinical_focus_skips_the_ot_topic():
    body, _ = _call("OA", MIXED)
    assert body["focus_topic"] == "distance_va"


def test_raw_osce_case_topic_is_never_the_focus():
    body, _ = _call("OA", ["Cirrus_Oct_Macular_Scan", "distance_va"])
    assert body["focus_topic"] == "distance_va"


def test_oa_and_psa_get_the_same_focus():
    """OA and PSA share one content pool, so identical input must give identical output."""
    oa, oa_kwargs = _call("OA", MIXED)
    psa, psa_kwargs = _call("PSA", MIXED)
    assert oa["focus_topic"] == psa["focus_topic"]
    assert oa_kwargs["messages"] == psa_kwargs["messages"]


def test_out_of_scope_topics_never_reach_the_prompt():
    """Not just the focus — the whole weak list is injected as context, so an
    unscoped entry would steer the coach even when it is not picked."""
    _, kwargs = _call("OT", MIXED)
    context = kwargs["messages"][0]["content"]
    assert "distance_va" not in context
    assert "Cirrus_Oct_Macular_Scan" not in context
    assert "hvf" in context


def test_all_topics_out_of_scope_degrades_to_no_focus():
    body, kwargs = _call("OT", ["distance_va", "Cirrus_Oct_Macular_Scan"])
    assert body["focus_topic"] is None
    assert "none identified yet" in kwargs["messages"][0]["content"]


@pytest.mark.parametrize("role", ["OA", "OT", "PSA"])
def test_the_prompt_names_the_role_scope(role):
    """The coach's system prompt carries the same derived scope line the tutor uses."""
    from tools.shared.role_scope import role_focus
    _, kwargs = _call(role, ["glaucoma"])
    assert role_focus(role) in kwargs["system_prompt"]


def test_a_blank_role_still_answers():
    """Profile creation seeds role blank. That must degrade to the shared clinical
    pool, not 500 and not drop every topic."""
    body, _ = _call("", ["distance_va"])
    assert body["focus_topic"] == "distance_va"
