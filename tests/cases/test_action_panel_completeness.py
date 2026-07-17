"""The action panel must never silently drop a manual procedure.

Regression for a real prod gap: `_MANUAL_LABELS` is an ALLOW-list, so any step whose
text no rule recognised fell through to a generically-clipped label, was classified
verbal, and vanished from the action panel with no warning. "Check doctor's medication
order for dilatation in EMR" — a CRITICAL step — was missing from 109 of 155 cases
that way.

These tests run against a frozen snapshot of the real Supabase procedure checklists
(tests/fixtures/procedure_checklists.json, refreshed by tools/kb/snapshot_checklists.py)
so they run keyless and offline in CI. They assert EVERY step of EVERY procedure
checklist is explicitly classified — deliberately manual or deliberately verbal —
so a new/re-ingested checklist step can never quietly disappear again.
"""

import json
from pathlib import Path

import pytest

from tools.cases.examination_actions import (
    _MANUAL_LABELS,
    _is_say,
    build_actions,
    match_label,
)

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "procedure_checklists.json"
CHECKLISTS = json.loads(FIXTURE.read_text(encoding="utf-8"))
STEPS = [
    (c["procedure_name"], s)
    for c in CHECKLISTS
    for s in c["steps"]
    if str(s.get("action") or "").strip()
]


def test_fixture_covers_the_real_procedure_checklists():
    # Guards against an empty/half-written fixture silently passing everything below.
    assert len(CHECKLISTS) == 17
    assert len(STEPS) > 300
    assert not any("Skills Observation" in c["procedure_name"] for c in CHECKLISTS)


def test_every_procedure_step_is_explicitly_classified():
    """No step may fall through to a generically-clipped label.

    A step reaching the clipping fallback means no rule claimed it — so nobody DECIDED
    whether it belongs in the action panel. Every step must match a rule that puts it
    explicitly in `_MANUAL_LABELS` (chip) or explicitly outside it (verbal).
    """
    unmatched = [
        f"{proc} step {s['step_number']}: {s['action'][:90]}"
        for proc, s in STEPS
        if not _is_say(s["action"]) and match_label(s["action"]) is None
    ]
    assert not unmatched, (
        f"{len(unmatched)} checklist step(s) match no label rule, so they silently "
        f"vanish from the action panel. Add a rule to _LABEL_RULES (and to "
        f"_MANUAL_LABELS if hands-on):\n  " + "\n  ".join(unmatched)
    )


@pytest.mark.parametrize(
    "procedure,step_number",
    [
        ("Eye Drop Instillation and Dilation", 1),  # the reported case
        ("Non-Contact Tonometry", 1),
        ("Cirrus OCT", 1),
        ("Basic Biometry", 2),
        ("Humphrey Visual Field", 1),
        ("Cornea Topography", 1),
        ("Distance Vision Testing LogMAR", 1),
        ("Auto Kerato-Refractometry (SOP)", 3),
        ("I-Care Competency", 6),
    ],
)
def test_check_doctors_order_is_a_manual_chip(procedure, step_number):
    """The reported bug: checking the doctor's order in the EMR is something the student
    DOES at the screen, not something they say to the patient — it needs a chip."""
    cl = next(c for c in CHECKLISTS if c["procedure_name"] == procedure)
    step = next(s for s in cl["steps"] if s["step_number"] == step_number)
    action = next(a for a in build_actions({}, cl["steps"]) if step_number in a["satisfies_steps"])
    assert action["label"] == "Check doctor's order", (
        f"{procedure} step {step_number} mislabelled: {step['action'][:80]}"
    )
    assert action["kind"] == "manual"


def test_doctor_keyword_does_not_swallow_unrelated_steps():
    """A bare "doctor" substring rule was mislabelling any step that merely mentions a
    doctor. These three are NOT "check the doctor's order" steps."""
    assert match_label("Doctor to examine patient’s eyes after the procedure.") == "Doctor to examine"
    assert match_label(
        "Record the result objectively without interpreting or certifying colour vision "
        "status (the doctor’s/optometrist’s role)."
    ) == "Document results"
    assert match_label(
        "Recognise that NEW distortion or scotoma (especially with reduced VA) in an "
        "at-risk patient is a red flag for referral to the doctor."
    ) != "Check doctor's order"


def test_broad_keywords_do_not_hijack_specific_steps():
    """Rules are first-match-wins, so an over-broad keyword high in the list silently
    steals steps from the rule that should own them. Each of these was a real mislabel."""
    # "Date of discard" is one of the drop-label checks — not a waste-disposal step.
    assert match_label(
        "Prepare the appropriate eye drops and observe the Guidelines on Administration "
        "of Medication. Check the eye drop: Name, Strength, Manufacturer’s expiry date, "
        "Date of opening, Date of discard, Clarity of medication - If clear bottle."
    ) == "Prepare eye drops"
    # A documentation step NAMES the procedure it documents; it must not collide with
    # that procedure's own chip and get merged away.
    assert match_label(
        "Record the date / time / distance vision readings onto the patient’s medical record / EMR."
    ) == "Document results"
    assert match_label(
        "Record the date / time / near vision readings onto the patient’s medical record / EMR notes."
    ) == "Document results"
    # Checking the order NAMES the procedure it authorises.
    assert match_label(
        "Check doctor’s order to perform Non-Contact Tonometry in patient’s medical record/EMR."
    ) == "Check doctor's order"
    # "…WITH corrective lenses" is the vision test, not a correction check.
    assert match_label(
        "Check patient’s distant vision with corrective lenses or contact lenses (if worn) "
        "using the LogMAR M&S Smart system."
    ) == "Test distance VA"
    assert match_label(
        "Check patient’s near vision with corrective lenses or contact lenses (if worn) "
        "using the Moorfields Reading Book and hold the reading card 40 cm away."
    ) == "Test near VA"
    # A correction CHECK, on the other hand, stays a correction check.
    assert match_label(
        "Ensure the patient wears their usual near/reading correction for the test."
    ) == "Check correction worn"


def test_near_vision_test_is_never_labelled_distance():
    """The near test also reads "from the largest characters", so a "largest character"
    keyword on the distance rule silently relabelled the whole near station."""
    assert match_label(
        "Test the right eye first (by convention) by occluding the left eye and ask patient "
        "to read with the right eye from the largest characters to the line of the smallest "
        "characters until patient is unable to read any further."
    ) != "Test distance VA"
    near = next(c for c in CHECKLISTS if c["procedure_name"] == "Near Vision Testing (SOP)")
    labels = {a["label"] for a in build_actions({}, near["steps"])}
    assert "Test near VA" in labels
    assert "Test distance VA" not in labels


def test_documentation_step_never_merges_into_the_procedure_chip():
    """Regression: "Record the date/time/distance vision readings" labelled as
    "Test distance VA", collided with the real VA step, and merge-by-label swallowed it —
    so the student could never log the reading."""
    steps = [
        {"step_number": 9, "action": "Check patient’s distant vision using the LogMAR chart", "category": "clinical_assessment", "critical": False},
        {"step_number": 18, "action": "Record the date / time / distance vision readings onto the patient’s medical record / EMR.", "category": "documentation", "critical": False},
    ]
    labels = {a["label"]: a["satisfies_steps"] for a in build_actions({}, steps)}
    assert labels["Test distance VA"] == [9]
    assert labels["Document results"] == [18]


def test_conversational_steps_stay_verbal():
    """The panel is for hands-on procedures. Talking to the patient is done in the live
    consult and auto-ticked by the examiner — those must NOT become chips."""
    for text in (
        "Introduce self to patient.",
        "Explain the purpose and procedure to patient.",
        "Identify patient against medical record/EMR using at least 2 identifiers: Patient Name",
        "Give clear explanation to patient on performing the test.",
        "Listens attentively to opening statement without interruption.",
        "Received the patient with respect",
        "Ensure patient is directed to waiting room.",
    ):
        label = match_label(text)
        assert label is not None, f"unclassified: {text}"
        assert label not in _MANUAL_LABELS, f"{text!r} became a manual chip ({label!r})"


def test_every_procedure_checklist_yields_at_least_one_manual_chip():
    """A procedure station with an empty action panel is a broken station."""
    empty = [
        c["procedure_name"]
        for c in CHECKLISTS
        if not any(a["kind"] == "manual" for a in build_actions({}, c["steps"]))
    ]
    assert not empty, f"procedure checklists with NO manual chips: {empty}"
