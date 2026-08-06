"""The per-step ledger reaches the database (migration 019).

The value of this test is the SHAPE: a trainer's report is rebuilt from these keys, so a
rename here is a silently broken report, not a failing render.
"""
from unittest.mock import patch

from tools.api.routers.cases import _build_checklist_detail


def test_build_checklist_detail_stamps_phase_performed_and_skipped():
    # Real categories that resolve to three DIFFERENT phases (see tools/cases/phase_split.py),
    # so the phase assertions below prove per-step attribution rather than merely that the
    # string is non-empty (all three would collapse into "Clinical Assessment" with no
    # category at all).
    steps = [
        {"step_number": 1, "action": "Greet and identify the patient", "critical": False,
         "category": "patient_identification"},
        {"step_number": 2, "action": "Check allergy status", "critical": True,
         "category": "clinical_assessment"},
        {"step_number": 3, "action": "Document the reading", "critical": False,
         "category": "post_procedure"},
    ]
    detail = _build_checklist_detail(steps, performed={1}, skipped={2})

    assert [d["step_number"] for d in detail] == [1, 2, 3]
    assert detail[0]["performed"] is True and detail[0]["skipped"] is False
    # Given up on: NOT performed, and flagged so a reader can tell it from never-reached.
    assert detail[1]["performed"] is False and detail[1]["skipped"] is True
    assert detail[1]["critical"] is True
    # Never reached: not performed, not skipped.
    assert detail[2]["performed"] is False and detail[2]["skipped"] is False
    # Each step carries its OWN phase name.
    assert detail[0]["phase"] == "Preparation & Identification"
    assert detail[1]["phase"] == "Clinical Assessment"
    assert detail[2]["phase"] == "Documentation & Follow-up"


def test_build_checklist_detail_is_empty_for_a_stepless_checklist():
    """A degraded station that resolved no steps writes [] -- which is distinguishable from
    a pre-019 row (NULL). It must not raise."""
    assert _build_checklist_detail([], performed=set(), skipped=set()) == []


def test_build_checklist_detail_keeps_step_order_when_phases_are_out_of_order():
    """group_by_phase's contract is groups, not ORDER -- phase_split.py's current
    assign_phases happens to emit contiguous, index-ordered ranges (so flattening its groups
    would reproduce step order too), but that is an artefact of today's category rules, not
    something group_by_phase promises. This fakes a grouping that puts step 3 in the
    EARLIEST phase and step 1 in the LATEST, and proves the ledger still comes back in the
    steps' own order -- never group_by_phase's -- because _build_checklist_detail iterates
    `steps`, using the groups only to look up each step's phase name.
    """
    steps = [
        {"step_number": 1, "action": "First on the checklist", "critical": False},
        {"step_number": 2, "action": "Second on the checklist", "critical": False},
        {"step_number": 3, "action": "Third on the checklist", "critical": False},
    ]

    def _fake_group_by_phase(_steps):
        return [
            {"phase": 1, "name": "Preparation & Identification", "steps": [steps[2]]},
            {"phase": 2, "name": "Clinical Assessment", "steps": [steps[1]]},
            {"phase": 3, "name": "Documentation & Follow-up", "steps": [steps[0]]},
        ]

    with patch("tools.api.routers.cases.group_by_phase", _fake_group_by_phase):
        detail = _build_checklist_detail(steps, performed=set(), skipped=set())

    assert [d["step_number"] for d in detail] == [1, 2, 3]
    assert detail[0]["phase"] == "Documentation & Follow-up"
    assert detail[1]["phase"] == "Clinical Assessment"
    assert detail[2]["phase"] == "Preparation & Identification"
