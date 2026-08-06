# tests/cases/test_observe_steps.py
from unittest.mock import patch

from tools.cases import observe_steps


def _steps():
    return [
        {"step_number": 1, "action": "Identify patient — name + NRIC", "critical": True},
        {"step_number": 2, "action": "Ask about eye-drop compliance", "critical": False},
        {"step_number": 3, "action": "Explain purpose and procedure", "critical": False},
    ]


def test_mock_mode_returns_empty(monkeypatch):
    monkeypatch.setattr(observe_steps, "MOCK_MODE", True)
    out = observe_steps.observe(_steps(), [{"role": "user", "content": "hi"}], already_ticked=[])
    assert out == []


def test_parses_and_filters_to_unticked_valid_steps(monkeypatch):
    monkeypatch.setattr(observe_steps, "MOCK_MODE", False)
    # model claims steps 2, 3 and a bogus 99; step 3 already ticked -> only 2 returned
    with patch.object(observe_steps, "ask", return_value="[2, 3, 99]"):
        out = observe_steps.observe(_steps(), [{"role": "user", "content": "are you using your drops?"}],
                                    already_ticked=[3])
    assert out == [2]


def test_bad_json_returns_empty(monkeypatch):
    monkeypatch.setattr(observe_steps, "MOCK_MODE", False)
    with patch.object(observe_steps, "ask", return_value="not json"):
        out = observe_steps.observe(_steps(), [{"role": "user", "content": "hello"}], already_ticked=[])
    assert out == []


def test_quota_error_returns_empty(monkeypatch):
    monkeypatch.setattr(observe_steps, "MOCK_MODE", False)
    with patch.object(observe_steps, "ask", side_effect=RuntimeError("quota_exceeded")):
        out = observe_steps.observe(_steps(), [{"role": "user", "content": "hello"}], already_ticked=[])
    assert out == []


def test_aggregates_evidence_across_multiple_student_messages(monkeypatch):
    """A step the student builds up over several turns must reach the examiner whole,
    and the examiner must be told to combine evidence spread across messages."""
    monkeypatch.setattr(observe_steps, "MOCK_MODE", False)
    captured: dict = {}

    def fake_ask(**kwargs):
        captured.update(kwargs)
        return "[1, 2]"

    msgs = [
        {"role": "user", "content": "Hi, can I confirm your name?"},
        {"role": "assistant", "content": "I'm John Tan."},
        {"role": "user", "content": "And your NRIC, please?"},
        {"role": "assistant", "content": "S1234567A."},
        {"role": "user", "content": "Are you using your eye drops daily?"},
    ]
    with patch.object(observe_steps, "ask", fake_ask):
        out = observe_steps.observe(_steps(), msgs, already_ticked=[])

    assert out == [1, 2]
    # the whole student-side conversation reaches the examiner — not just the last turn
    convo = captured["messages"][0]["content"]
    assert "confirm your name" in convo and "NRIC" in convo and "eye drops" in convo
    # the examiner is explicitly told to combine evidence split across messages
    sp = captured["system_prompt"].lower()
    assert "combine" in sp and "messages" in sp
    # generous token headroom so the JSON array is never silently truncated
    assert captured["max_tokens"] >= 512


# ── Calibration (user-reported: the station is "too strict and hard") ────────────────
# The examiner is an AI, so what it is TOLD is the only place this rule can live. These pin
# the two halves against each other: a later edit that drops either one is the bug.

def test_the_examiner_marks_to_a_competent_standard():
    """Enumerated sub-items are guidance for the assessor, not a script to recite."""
    system = observe_steps._EXAMINER_SYSTEM.lower()
    assert "competent standard" in system
    assert "substance" in system
    assert "upward" in system
    assert "names that protocol" in system


def test_leniency_never_reaches_the_evidence_guards():
    """Leniency about DEPTH must not become leniency about whether it happened at all —
    those three guards are what stop the checklist ticking itself."""
    system = observe_steps._EXAMINER_SYSTEM
    assert "BE STRICT" in system
    assert "NEVER tick a step because the PATIENT said it" in system
    assert "mentioned in passing" in system
