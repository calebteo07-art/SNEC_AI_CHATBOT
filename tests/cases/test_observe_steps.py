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
