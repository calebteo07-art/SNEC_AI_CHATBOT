"""The stuck-valve's first stage: a lenient re-check of ONE step.

Removing manual ticking made /observe load-bearing — a missed detection used to be
recoverable with a tap. `focus_step` lets the student say "you missed this one" and get a
second, step-specific read of the transcript before anything is self-marked.
"""
from unittest.mock import patch

import tools.cases.observe_steps as obs

STEPS = [
    {"step_number": 1, "action": "Identify patient — name + NRIC", "critical": True},
    {"step_number": 2, "action": "Explain purpose & procedure", "critical": False},
]
MESSAGES = [{"role": "user", "content": "Morning, can I confirm your name and NRIC?"}]


def _capture(focus):
    """Run observe() with the model stubbed, returning the prompt it would have sent."""
    seen = {}

    def fake_ask(**kwargs):
        seen["prompt"] = kwargs["messages"][0]["content"]
        return "[]"

    with patch.object(obs, "MOCK_MODE", False), patch.object(obs, "ask", fake_ask):
        obs.observe(STEPS, MESSAGES, [], None, focus)
    return seen["prompt"]


def test_focus_step_adds_a_lenient_recheck_for_that_step():
    prompt = _capture(2)
    assert "step 2" in prompt
    assert "believes" in prompt.lower()


def test_no_focus_step_leaves_the_prompt_unchanged():
    assert "believes" not in _capture(None).lower()


def test_focus_step_that_is_already_ticked_or_unknown_is_ignored():
    # 99 is not a step in this checklist — never invent a focus note for it.
    assert "step 99" not in _capture(99)
