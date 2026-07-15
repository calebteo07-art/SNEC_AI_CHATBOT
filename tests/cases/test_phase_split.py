# tests/cases/test_phase_split.py
"""Tests for deterministic 3-phase split of checklist steps."""
from tools.cases.phase_split import assign_phases, group_by_phase, PHASE_NAMES


def _steps(*cats):
    return [{"step_number": i + 1, "category": c, "action": f"step {i+1}", "critical": False}
            for i, c in enumerate(cats)]


def test_anchor_split_three_phases():
    # prep, prep, clinical, clinical, post  -> 1,1,2,2,3
    steps = _steps("patient_identification", "patient_education",
                   "clinical_assessment", "clinical_assessment", "post_procedure")
    assert assign_phases(steps) == [1, 1, 2, 2, 3]


def test_mid_procedure_education_is_phase_two():
    # education between two clinical steps stays in the procedure span
    steps = _steps("clinical_assessment", "patient_education", "clinical_assessment")
    assert assign_phases(steps) == [2, 2, 2]


def test_no_procedure_anchor_falls_back():
    # no clinical_assessment/medication: leading prep -> 1, trailing post -> 3, rest -> 2
    steps = _steps("patient_identification", "equipment", "post_procedure")
    phases = assign_phases(steps)
    assert phases[0] == 1
    assert phases[-1] == 3


def test_every_step_assigned_exactly_once():
    steps = _steps("documentation", "patient_identification", "clinical_assessment",
                   "infection_control", "post_procedure", "documentation")
    phases = assign_phases(steps)
    assert len(phases) == len(steps)
    assert all(p in (1, 2, 3) for p in phases)


def test_group_by_phase_omits_empty_phases():
    # all clinical -> only phase 2 present
    steps = _steps("clinical_assessment", "clinical_assessment")
    groups = group_by_phase(steps)
    assert [g["phase"] for g in groups] == [2]
    assert groups[0]["name"] == PHASE_NAMES[2]
    assert len(groups[0]["steps"]) == 2


def test_group_by_phase_preserves_all_steps():
    steps = _steps("patient_identification", "clinical_assessment", "post_procedure")
    groups = group_by_phase(steps)
    total = sum(len(g["steps"]) for g in groups)
    assert total == 3


def test_miscategorised_prep_does_not_pull_id_into_assessment():
    # Regression (sequence bug): several real checklists miscategorise a prep step as
    # clinical_assessment (e.g. "Check for patient's needs (wheelchair)"), which would fire
    # the phase-2 anchor too early and drag greeting/identification into "Clinical
    # Assessment". Those prep-worded steps must NOT become the anchor — greeting/ID/hand
    # hygiene stay in Phase 1.
    steps = [
        {"step_number": 1, "category": "documentation", "action": "Check doctor's written order", "critical": False},
        {"step_number": 2, "category": "clinical_assessment", "action": "Check for patient's needs (wheelchair)", "critical": False},
        {"step_number": 3, "category": "patient_education", "action": "Introduce self to patient", "critical": False},
        {"step_number": 4, "category": "patient_identification", "action": "Identify the correct patient using 2 identifiers", "critical": True},
        {"step_number": 5, "category": "infection_control", "action": "Perform 5 moments of hand hygiene", "critical": True},
        {"step_number": 6, "category": "clinical_assessment", "action": "Ensure the sharpest image is captured", "critical": False},
        {"step_number": 7, "category": "documentation", "action": "Print the results", "critical": False},
    ]
    phases = assign_phases(steps)
    # Doctor's order, needs check, intro, ID and hand hygiene are all Phase 1.
    assert phases[:5] == [1, 1, 1, 1, 1]
    # The genuine procedure (image capture) opens Phase 2; printing is Phase 3.
    assert phases[5] == 2
    assert phases[6] == 3
