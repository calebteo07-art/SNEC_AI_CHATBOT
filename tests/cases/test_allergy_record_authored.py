"""Every case whose checklist asks for the allergy record must carry one.

The Check-allergy chip reveals `case["history"]["allergies"]` — the EMR line the student
reads at the screen. An unauthored field reveals NOTHING (build_actions never invents a
record), which is exactly the reported bug: "just states examination performed, doesn't
show if got allergy or not". So this fails closed, the same way
test_action_panel_completeness.py fails closed on an unclassified step.

Keyless/offline: resolution runs against the frozen checklist snapshot.
"""

import json
from pathlib import Path

from tools.cases.examination_actions import build_actions
from tools.cases.resolve_checklist import resolve_procedure_name

ROOT = Path(__file__).resolve().parents[2]
CHECKLISTS = json.loads(
    (ROOT / "tests" / "fixtures" / "procedure_checklists.json").read_text(encoding="utf-8")
)
BY_NAME = {c["procedure_name"]: c for c in CHECKLISTS}
CASES = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((ROOT / "cases").glob("*.json"))]

# Cases whose resolved checklist contains a dual-source (record + ask) step.
DUAL_CASES = [
    c for c in CASES
    if (cl := BY_NAME.get(resolve_procedure_name(c)[0] or ""))
    and any(a["dual_kind"] == "ask" for a in build_actions({}, cl["steps"]))
]


def test_the_fixture_and_cases_actually_loaded():
    """Guards against an empty glob passing everything below by vacuous truth."""
    assert len(CASES) > 140
    assert len(DUAL_CASES) >= 23


def test_every_case_with_an_allergy_step_records_the_allergy():
    missing = [
        c["case_id"] for c in DUAL_CASES
        if not str((c.get("history") or {}).get("allergies") or "").strip()
    ]
    assert not missing, (
        f"{len(missing)} case(s) whose checklist asks the student to check the allergy "
        f"record have no history.allergies, so the chip reveals nothing:\n  "
        + "\n  ".join(missing)
    )


def test_the_allergy_line_is_a_short_record_line_not_a_paragraph():
    """It renders as one "Result ·" line in the EyeBot pane. pmhx prose belongs in pmhx."""
    long = [
        f"{c['case_id']}: {len(c['history']['allergies'])} chars"
        for c in DUAL_CASES
        if len(str(c["history"]["allergies"])) > 120
    ]
    assert not long, f"allergy record too long to read as a chart line: {long}"


def test_a_recorded_allergy_is_named_not_just_flagged():
    """A case whose patient IS allergic on file must name the drug — "has an allergy" with
    no name is useless to a student deciding whether the charted drop is safe."""
    psa_023 = next(c for c in CASES if c["case_id"] == "case_psa_023_dilation_fundus_prep_phenylephrine_allergy")
    assert "phenylephrine" in str(psa_023["history"]["allergies"]).lower()


def test_the_reported_reaction_case_keeps_a_clean_record():
    """case_oa_028 is the teaching case: the patient reports a reaction that is NOT on
    file. If the record named it, checking the EMR alone would answer the station."""
    oa_028 = next(c for c in CASES if c["case_id"] == "case_oa_028_eye_drop_instillation_allergy_check")
    record = str(oa_028["history"]["allergies"]).lower()
    assert "no " in record and "phenylephrine" not in record
