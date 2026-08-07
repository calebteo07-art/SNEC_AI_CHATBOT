"""The patient is a patient, not an examiner holding the answer key.

Two leaks, both across the same boundary — the case file is simultaneously the patient's
script and the marking scheme:

  * `diagnosis` was serialized into the patient prompt on the theory that the model needs
    to know what NOT to reveal. A patient character has no legitimate use for it, and the
    field carries clinical interpretation that mirrors the rubric's key points.

  * 16 of 155 cases put the MARKING KEY under `investigations.key_points`, and in 15 of
    them `task` + `key_points` are the only keys there — so an in-scope question ("what
    are the investigation results?") could only be answered out of the answer key. The
    design already withholds `management` for precisely this reason.

Disclosure was probabilistic, not certain, because other prompt rules compete. That is not
a defence: the key was demonstrably in context alongside an instruction authorising its
release.

The grader is unaffected — evaluate_case builds its own context from the unfiltered case.
"""
import json
from pathlib import Path

import pytest

from tools.api.shared import PATIENT_SYSTEM
from tools.cases.patient_view import build_patient_view, strip_marking

CASES_DIR = Path(__file__).resolve().parent.parent.parent / "cases"
CASE_FILES = sorted(CASES_DIR.glob("case_*.json"))


def _load(f: Path) -> dict:
    return json.loads(f.read_text(encoding="utf-8"))


def test_there_are_cases_to_check():
    assert len(CASE_FILES) > 100, "the sweep below is only meaningful over the real corpus"


@pytest.mark.parametrize("f", CASE_FILES, ids=lambda f: f.stem)
def test_no_case_hands_the_patient_its_diagnosis(f):
    case = _load(f)
    view = build_patient_view(case)
    assert "diagnosis" not in view
    assert "management" not in view
    assert "rubric" not in view


@pytest.mark.parametrize("f", CASE_FILES, ids=lambda f: f.stem)
def test_no_marking_key_reaches_the_patient_prompt(f):
    """The strong form: render the ACTUAL prompt and look for the marking text in it."""
    case = _load(f)
    prompt = PATIENT_SYSTEM.format(
        case_json=json.dumps(build_patient_view(case), separators=(",", ":")))

    inv = case.get("investigations")
    if isinstance(inv, dict):
        for key in ("key_points", "points", "task"):
            val = inv.get(key)
            if isinstance(val, str) and len(val) > 25:
                assert val not in prompt, f"investigations.{key} leaked into the patient prompt"

    dx = case.get("diagnosis")
    if isinstance(dx, str) and len(dx) > 25:
        assert dx not in prompt, "the diagnosis leaked into the patient prompt"


def test_the_leaking_corpus_is_real_and_still_carries_its_content():
    """Guards the fix from being 'solved' by deleting the authored content instead.

    The 16 cases must KEEP their key_points — the grader reads them — while the patient
    must not see them. If this count reaches zero, check whether someone stripped the case
    files rather than the patient view.
    """
    leaking = [c for c in (_load(f) for f in CASE_FILES)
               if isinstance(c.get("investigations"), dict)
               and {"task", "key_points"} & set(c["investigations"])]
    assert len(leaking) >= 15, "the marking-key content must stay in the case files"
    for case in leaking:
        view = build_patient_view(case)
        assert "key_points" not in (view.get("investigations") or {})
        assert "task" not in (view.get("investigations") or {})


def test_measurements_survive_the_strip():
    """Stripping must remove the marking scheme and nothing else — a station whose findings
    the student can never obtain is worse than one whose patient is too forthcoming."""
    out = strip_marking({
        "va_distance": "6/12 right, 6/9 left", "iop_nct": "18 / 17 mmHg",
        "task": "Instil the charted drops correctly",
        "key_points": "Wait about 5 minutes between different drops",
    })
    assert out == {"va_distance": "6/12 right, 6/9 left", "iop_nct": "18 / 17 mmHg"}


def test_an_investigations_block_that_was_only_marking_keys_is_dropped_entirely():
    """Not sent as {} — an empty object invites the model to invent findings."""
    view = build_patient_view({
        "patient": {"name": "Mr Tan"},
        "investigations": {"task": "Instil the drops", "key_points": "Wait 5 minutes"},
    })
    assert "investigations" not in view
    assert view["patient"] == {"name": "Mr Tan"}


def test_the_patient_still_gets_what_it_needs_to_play_the_role():
    case = {
        "patient": {"name": "Mr Tan", "age": 60, "nric": "S1234567A"},
        "history": {"presenting_complaint": "red eye for two days"},
        "examination_findings": {"va_distance": "6/9 both eyes"},
        "investigations": {"iop_nct": "18 / 17 mmHg", "key_points": "the marking key"},
        "diagnosis": "Viral conjunctivitis",
        "management": "Cool compresses; hygiene advice",
        "rubric": {"history": {"key_points": ["asks about discharge"]}},
    }
    view = build_patient_view(case)
    assert view["patient"]["nric"] == "S1234567A"      # identity check is part of the OSCE
    assert view["history"]["presenting_complaint"] == "red eye for two days"
    assert view["examination_findings"] == {"va_distance": "6/9 both eyes"}
    assert view["investigations"] == {"iop_nct": "18 / 17 mmHg"}
    assert set(view) == {"patient", "history", "examination_findings", "investigations"}
