"""The conversational examiner must NEVER auto-tick a hands-on (manual) step.

Manual procedures tick only via the action panel; the /observe examiner watches the
consult and may tick verbal steps only. `observe(..., exclude_steps=<manual step nums>)`
filters manual steps out even if the model over-eagerly names them.
"""
import tools.cases.observe_steps as obs

STEPS = [
    {"step_number": 1, "action": "Ask about compliance"},
    {"step_number": 2, "action": "Introduce self and confirm identity"},
    {"step_number": 3, "action": "Measure IOP with the tonometer"},   # manual
]


def test_manual_step_is_never_returned_even_if_model_names_it(monkeypatch):
    monkeypatch.setattr(obs, "MOCK_MODE", False)
    monkeypatch.setattr(obs, "ask", lambda *a, **k: "[1, 3]")  # model over-eagerly ticks 3
    out = obs.observe(STEPS, [{"role": "user", "content": "..."}], already_ticked=[], exclude_steps={3})
    assert out == [1]                       # verbal step ticks; manual step 3 filtered out


def test_without_exclusion_all_named_steps_return(monkeypatch):
    monkeypatch.setattr(obs, "MOCK_MODE", False)
    monkeypatch.setattr(obs, "ask", lambda *a, **k: "[1, 3]")
    out = obs.observe(STEPS, [{"role": "user", "content": "..."}], already_ticked=[])
    assert out == [1, 3]                     # no exclusion → both returned


def test_mock_mode_returns_empty(monkeypatch):
    monkeypatch.setattr(obs, "MOCK_MODE", True)
    out = obs.observe(STEPS, [{"role": "user", "content": "..."}], already_ticked=[], exclude_steps={3})
    assert out == []
