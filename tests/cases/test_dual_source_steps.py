"""A checklist step that names TWO sources must need both of them.

The reported bug: "Check that the patient is not allergic to the selected eye drops by
verifying with the patient's medical record/EMR **and** by asking the patient" is a
CRITICAL step, but the action panel ticked it on one click of the Check-allergy chip —
the student never had to ask the patient. The same chip also revealed nothing, because
`reveal_text` is resolved only from `examination_findings` and no case carried an
allergy record at all.

So: a "do" step that names both the record and asking the patient is a DUAL-SOURCE step
(`also_ask`) — the chip records the EMR half, the /observe examiner judges the asking
half, and only both together tick it. Detected on the STEP TEXT, not the label, so an
EMR-only allergy step in a future checklist keeps ticking on one click.
"""

import json
from pathlib import Path

from tools.cases.examination_actions import (
    build_actions,
    examiner_excluded_steps,
    is_dual_step,
)

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "procedure_checklists.json"
CHECKLISTS = json.loads(FIXTURE.read_text(encoding="utf-8"))

# The step, verbatim from both drop checklists (curly apostrophe, as ingested).
ALLERGY_STEP = (
    "Check that the patient is not allergic to the selected eye drops by verifying "
    "with the patient’s medical record/EMR and by asking the patient."
)
DROP_CHECKLISTS = ("Eye Drop Instillation and Dilation", "Instillation of Eye Drops")


def _chip(procedure: str, label: str, allergy_record: str = "") -> dict:
    cl = next(c for c in CHECKLISTS if c["procedure_name"] == procedure)
    actions = build_actions({}, cl["steps"], allergy_record=allergy_record)
    return next(a for a in actions if a["label"] == label)


def test_the_allergy_step_names_both_sources():
    assert is_dual_step(ALLERGY_STEP) is True


def test_an_emr_only_step_is_not_dual():
    """Checking the doctor's order names the record but nobody to ask — one click is right."""
    assert is_dual_step(
        "Check doctor’s order to perform Non-Contact Tonometry in patient’s medical record/EMR."
    ) is False


def test_an_ask_only_step_is_not_dual():
    assert is_dual_step("Ask the patient about their eye-drop compliance.") is False


def test_check_allergy_chip_is_dual_in_both_drop_checklists():
    for procedure in DROP_CHECKLISTS:
        chip = _chip(procedure, "Check allergy")
        assert chip["also_ask"] is True, procedure
        assert chip["kind"] == "manual", procedure
        # Still a one-click record check — the second half is the consult, not typing.
        assert chip["quick"] is True, procedure


def test_no_other_chip_in_any_real_checklist_is_dual():
    """The rule must stay narrow. A dual step reopens the patient composer while it is the
    gate, so a false positive would let a hands-on procedure be talked through instead."""
    dual = {
        (c["procedure_name"], a["label"])
        for c in CHECKLISTS
        for a in build_actions({}, c["steps"])
        if a["also_ask"]
    }
    assert dual == {(p, "Check allergy") for p in DROP_CHECKLISTS}


def test_non_dual_chips_default_to_false():
    assert _chip("Non-Contact Tonometry", "Measure IOP")["also_ask"] is False


def test_check_allergy_chip_reveals_the_authored_record():
    """The reported bug: the chip said "examination performed" and nothing else."""
    record = "ALLERGY RECORDED — Phenylephrine eye drops."
    for procedure in DROP_CHECKLISTS:
        assert _chip(procedure, "Check allergy", allergy_record=record)["reveal_text"] == record


def test_an_unauthored_record_reveals_nothing_rather_than_inventing_one():
    """No allergy record on the case must never render as "no allergies" — that is a
    clinical claim the case never made. tests/cases/test_allergy_record_authored.py is
    the guard that stops a case shipping without one."""
    assert _chip("Instillation of Eye Drops", "Check allergy")["reveal_text"] == ""


def test_the_allergy_record_never_leaks_onto_another_chip():
    record = "No drug allergy recorded on file."
    for procedure in DROP_CHECKLISTS:
        cl = next(c for c in CHECKLISTS if c["procedure_name"] == procedure)
        revealed = {
            a["label"] for a in build_actions({}, cl["steps"], allergy_record=record)
            if a["reveal_text"] == record
        }
        assert revealed == {"Check allergy"}, procedure


def test_dual_survives_a_merge_with_a_single_source_step():
    """Chips merge by label. If any merged step needs the patient asked, the chip does —
    OR'd like `critical`, so a merge can never quietly drop the second source."""
    steps = [
        {"step_number": 4, "action": "Check the patient is not allergic to the drops.", "critical": True},
        {"step_number": 9, "action": ALLERGY_STEP, "critical": True},
    ]
    chip = next(a for a in build_actions({}, steps) if a["label"] == "Check allergy")
    assert chip["satisfies_steps"] == [4, 9]
    assert chip["also_ask"] is True


def test_examiner_may_tick_a_dual_step_but_no_other_manual_step():
    """/observe hides manual steps from the examiner — but a dual step's second half IS
    the consult, so hiding it would make the step untickable forever (and a missed
    critical step caps Judgement & Safety at x0.6)."""
    cl = next(c for c in CHECKLISTS if c["procedure_name"] == "Instillation of Eye Drops")
    actions = build_actions({}, cl["steps"])
    excluded = examiner_excluded_steps(actions)
    allergy = next(a for a in actions if a["label"] == "Check allergy")
    iop_like = next(a for a in actions if a["kind"] == "manual" and not a["also_ask"])

    assert not (set(allergy["satisfies_steps"]) & excluded)
    assert set(iop_like["satisfies_steps"]) <= excluded
    # Verbal steps were never excluded and must stay that way.
    verbal = {n for a in actions if a["kind"] == "verbal" for n in a["satisfies_steps"]}
    assert not (verbal & excluded)
