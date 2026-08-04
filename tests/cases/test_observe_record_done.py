"""The examiner must judge only the half of a dual-source step it can actually see.

A dual step's text demands the record be verified AND the patient asked. The examiner
reads the consult transcript only, so left as-is a STRICT examiner (which it is told to
be) would refuse to tick a step whose EMR half it has no evidence for — and the step is
CRITICAL, so never ticking it caps Judgement & Safety at x0.6 through no fault of the
student. `record_done` tells it the record half is already done in the action panel.
"""
from unittest.mock import patch

from tools.cases import observe_steps

ALLERGY = (
    "Check that the patient is not allergic to the selected eye drops by verifying with "
    "the patient’s medical record/EMR and by asking the patient."
)
HYGIENE = (
    "Perform hand hygiene and confirm the patient's identity (name and NRIC/date of "
    "birth) and the indication for Amsler testing (e.g. macular/AMD monitoring)."
)
STEPS = [
    {"step_number": 1, "action": "Introduce self and confirm identity"},
    {"step_number": 5, "action": ALLERGY},
    {"step_number": 6, "action": "Instil one drop into the lower fornix"},
]
HYGIENE_STEPS = [
    {"step_number": 1, "action": HYGIENE},
    {"step_number": 13, "action": "Perform hand hygiene after touching the patient."},
]


def _capture(record_done, already_ticked=(), returns="[5]", steps=None):
    captured: dict = {}

    def fake_ask(**kwargs):
        captured.update(kwargs)
        return returns

    with patch.object(observe_steps, "MOCK_MODE", False), patch.object(observe_steps, "ask", fake_ask):
        out = observe_steps.observe(
            steps if steps is not None else STEPS,
            [{"role": "user", "content": "Any allergies to eye drops?"}],
            already_ticked=list(already_ticked), record_done=record_done,
        )
    return out, captured.get("messages", [{}])[0].get("content", "")


def test_the_prompt_says_the_record_half_is_already_done():
    out, prompt = _capture([5])
    assert out == [5]
    low = prompt.lower()
    assert "step 5" in low
    assert "record" in low and "action panel" in low
    # It removes ONE half; the asking must still be judged on the transcript.
    assert "asked the patient" in low


def test_no_note_without_the_record_half():
    _, prompt = _capture([])
    assert "action panel" not in prompt.lower()


def test_no_note_for_a_step_that_is_already_ticked():
    """The note must scope exactly like the stuck-valve's: only steps still remaining."""
    _, prompt = _capture([5], already_ticked=[5], returns="[]")
    assert "action panel" not in prompt.lower()


def test_record_done_is_not_a_free_tick():
    """Naming a step in record_done must not make the examiner's answer irrelevant — the
    result still comes from the model reading the transcript."""
    out, _ = _capture([5], returns="[]")
    assert out == []


def test_the_note_names_the_half_this_step_actually_needs():
    """A hygiene+identity step's outstanding half is the IDENTITY check, not asking about
    allergies. Telling the examiner to judge "whether they asked the patient" would have it
    grade the wrong thing, and the wrong thing is a critical step."""
    _, prompt = _capture([1], returns="[1]", steps=HYGIENE_STEPS)
    note = prompt.split("NOTE:")[-1].lower()
    assert "step 1" in note and "action panel" in note
    assert "identity" in note
    assert "medical record" not in note and "emr" not in note


def test_a_step_with_no_second_half_gets_no_note():
    """record_done carries whatever the client recorded; a step that is not dual at all
    must not acquire a free excuse from being listed."""
    _, prompt = _capture([13], returns="[]", steps=HYGIENE_STEPS)
    assert "action panel" not in prompt.lower()
