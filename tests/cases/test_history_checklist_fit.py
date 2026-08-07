"""A station must not be graded against a checklist that describes a different encounter.

"History Taking" is not a general history checklist. It is a 29-step RED EYE interview:

    step 5   Ask about patient complaints of red eye: How long was the eye been red?
    step 11  Ask more about the symptom: Any itching?
    step 13  Ask more about the symptom: Any discharge present or absent?
    step 14  ... if there was discharge, what was the color?
    step 28  Ensure patient is directed to waiting room.

The keyword rule that routed cases to it opened with the catch-alls "history" and
"triage", so it captured 34 of 155 cases regardless of presentation — and the checklist
drives 40 of the 100 marks plus the in-sequence gate.

The sharpest case is `case_psa_035` (CRAO). Its own file says the eye is
*"Quiet, white eye (no redness)"*, and its management says to alert the doctor and **not
leave the patient waiting** — while checklist step 28 PAID the student for directing them
to the waiting room. A student who behaved correctly scored lower for it.

`case_psa_018` is a TELEPHONE triage: the patient is not in the building, so "perform hand
wash if touched patient" and fourteen red-eye questions are untickable by construction.

What stays: presentations where the eye genuinely is red — conjunctivitis, uveitis,
keratitis, subconjunctival haemorrhage, dry eye, corneal foreign body, chemical injury,
angle closure, welder's flash burn.

What leaves: everything whose eye is not red. Those fall through to the case's own rubric,
which is derived from that case, so at worst it is generic — never contradictory. Authoring
real SNEC checklists for triage/trauma, sudden vision loss and general medical history is
the proper fix and needs clinical sign-off; this stops the active mis-grading meanwhile.
"""
import json
from pathlib import Path

import pytest

from tools.cases.resolve_checklist import resolve_procedure_name

CASES_DIR = Path(__file__).resolve().parents[2] / "cases"
CASE_FILES = sorted(CASES_DIR.glob("case_*.json"))

RED_EYE = "History Taking"

# Asserted EXACTLY, both directions: adding a case here needs a red eye, and removing one
# needs a reason. This is the same shape as PENDING_CLINICAL_REVIEW in
# test_no_tally_sheet_stations.py — a list that can only change deliberately.
EXPECTED_RED_EYE_TOPICS = {
    "history_taking_triage",                       # "The Red Eye Emergency" (explicit)
    "history_taking_red_eye_triage",
    "red_eye_differential_triage",
    "red_eye_conjunctivitis",
    "red_eye_contact_lens_keratitis",
    "red_eye_uveitis_iritis",
    "red_eye_subconjunctival_haemorrhage",
    "red_eye_dry_eye_differential",
    "contact_lens_keratitis_history",
    "history_taking_contact_lens_overwear",
    "uveitis_history_taking",
    "corneal_foreign_body_triage",
    "chemical_injury_irrigation",
    "chemical_injury_alkali_immediate_irrigation",
    "acute_angle_closure_glaucoma_triage",
    "pain_assessment_acute_glaucoma_redflags",
    "history_taking_pain_assessment",              # angle-closure presentation
    "triage_flash_burn_welder_painful_red_eye",
}

# Named individually, because "16 cases moved" is a number and these are the reasons.
MUST_NOT_BE_RED_EYE = {
    "triage_sudden_painless_vision_loss_crao",     # the case says: quiet, WHITE eye
    "triage_chemical_splash_phone",                # the patient is on the telephone
    "retinal_detachment_symptoms",
    "history_taking_flashes_floaters",
    "triage_floaters_flashes_retinal_history",
    "diabetic_history_taking",
    "history_taking_general_health",
    "history_taking_general_health_medication_allergy",
    "history_taking_medication_allergy",
    "history_taking_visually_impaired",
    "history_taking_ocular_presenting_problem",
    "penetrating_eye_injury",
    "penetrating_eye_injury_shield_escalate",
    "hyphaema_blunt_trauma",
    "hyphaema_blunt_trauma_escalate",
    "triage_recent_surgery_red_flag_referral",
}


def _cases():
    return [json.loads(f.read_text(encoding="utf-8")) for f in CASE_FILES]


def test_only_red_eye_presentations_use_the_red_eye_checklist():
    actual = {c.get("topic", "") for c in _cases()
              if resolve_procedure_name(c)[0] == RED_EYE}
    assert actual == EXPECTED_RED_EYE_TOPICS


@pytest.mark.parametrize("topic", sorted(MUST_NOT_BE_RED_EYE))
def test_a_non_red_eye_presentation_never_lands_on_it(topic):
    matches = [c for c in _cases() if c.get("topic", "") == topic]
    assert matches, f"fixture drift: no case with topic {topic!r}"
    for case in matches:
        name = resolve_procedure_name(case)[0]
        assert name != RED_EYE, (
            f"{case['case_id']} is not a red-eye presentation but is graded on the "
            f"29-step red-eye interview")


def test_the_crao_case_is_not_paid_for_the_thing_its_own_file_forbids():
    """The concrete inversion, asserted against the case's own text rather than a topic."""
    case = next(c for c in _cases() if c.get("topic") == "triage_sudden_painless_vision_loss_crao")
    findings = json.dumps(case.get("examination_findings", {})).lower()
    management = json.dumps(case.get("management", {})).lower()
    assert "no redness" in findings, "fixture drift: this case no longer says the eye is white"
    assert "do not leave the patient" in management
    assert resolve_procedure_name(case)[0] != RED_EYE


def test_the_narrowing_actually_moved_cases():
    """Tripwire: the sweep above would also pass if the rule matched nothing at all."""
    on_it = [c for c in _cases() if resolve_procedure_name(c)[0] == RED_EYE]
    assert 12 <= len(on_it) <= 24, f"{len(on_it)} cases on the red-eye checklist"
