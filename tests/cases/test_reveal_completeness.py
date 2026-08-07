"""A chip that performs a measurement must actually reveal it.

test_reveal_source.py guards the opposite fault — a chip revealing a finding it did not
perform. This is the one that was reported first and never closed: on 15 stations the chip
for the station's HEADLINE measurement revealed nothing at all.

  8 Ishihara cases  -> a "Colour vision" chip with reveal_text == ""
  4 Amsler cases    -> an "Amsler grid" chip with reveal_text == ""
  3 near-vision     -> a "Test near VA" chip with reveal_text == ""

The reveal engine reads only `case["examination_findings"]`, and not one of those cases
authors `colour_vision`, `amsler` or `near_va` there — the measurements are authored under
`investigations`, as `ishihara_test`, `colour_vision_ishihara`, `amsler_grid`,
`near_vision`, `va_near`. `/station` never returns `investigations`, so the student
performed the Ishihara test and the transcript showed no plate score, while checklist step
11 asked them to "tally and record the number of plates correctly identified" and /action
graded them with "Measured finding: (none)". The only way to obtain it was to ask a
patient to recite their own colour-vision score.

`va` is equally patient-reported and IS chip-revealed on all 155 cases, so the
inconsistency — not the patient-reported-ness — is the defect.

Merging is safe by construction: `_finding_for_step` only reveals a key whose canonical
family is in FINDING_LABELS *and* whose chip carries the matching label, so an unrecognised
investigations key is inert, and marking keys are stripped before they get near it.
"""
import json
from pathlib import Path

import pytest

from tools.cases.examination_actions import FINDING_LABELS, build_actions
from tools.cases.reveal_findings import revealable_findings

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "procedure_checklists.json"
# The snapshot is a LIST of checklist rows (as Supabase returns them); index it by name so
# this reads like the runtime's get_checklist_by_name.
CHECKLISTS = {c["procedure_name"]: c
              for c in json.loads(FIXTURE.read_text(encoding="utf-8"))}
CASES_DIR = Path(__file__).resolve().parents[2] / "cases"
CASE_FILES = sorted(CASES_DIR.glob("case_*.json"))

# Label -> the finding family it performs, inverted from FINDING_LABELS.
LABEL_FAMILY = {lbl: fam for fam, lbls in FINDING_LABELS.items() for lbl in lbls}


def _steps_for(case: dict) -> list[dict]:
    """The station's resolved checklist steps, from the snapshot fixture."""
    from tools.cases.resolve_checklist import (
        build_rubric_checklist, is_tally_sheet, resolve_procedure_name,
    )
    name = resolve_procedure_name(case)[0]
    if name and not is_tally_sheet(name):
        cl = CHECKLISTS.get(name)
        if cl:
            raw = cl.get("steps") or []
            return raw.get("steps", []) if isinstance(raw, dict) else raw
    return build_rubric_checklist(case)["steps"]


def _load(f: Path) -> dict:
    return json.loads(f.read_text(encoding="utf-8"))


@pytest.mark.parametrize("f", CASE_FILES, ids=lambda f: f.stem)
def test_every_measuring_chip_reveals_what_it_measured(f):
    case = _load(f)
    findings = revealable_findings(case)
    actions = build_actions(findings, _steps_for(case))

    for a in actions:
        family = LABEL_FAMILY.get(a["label"])
        if family is None:
            continue                       # not a measuring chip — nothing to reveal
        if family not in findings:
            continue                       # this case genuinely never measures it
        assert a.get("reveal_text"), (
            f"{case['case_id']}: chip {a['label']!r} performs {family} and the case authors "
            f"it, but the chip reveals nothing"
        )


def test_the_three_broken_families_are_actually_fixed():
    """Named explicitly so a regression reads as 'Ishihara broke again', not as a count."""
    broken = {"colour_vision": [], "amsler": [], "near_va": []}
    for f in CASE_FILES:
        case = _load(f)
        findings = revealable_findings(case)
        actions = build_actions(findings, _steps_for(case))
        for a in actions:
            family = LABEL_FAMILY.get(a["label"])
            if family in broken and family in findings and not a.get("reveal_text"):
                broken[family].append(case["case_id"])
    assert broken == {"colour_vision": [], "amsler": [], "near_va": []}


def test_the_measurements_are_found_at_all():
    """Tripwire: if the alias table drifts, the sweep above would pass by finding nothing."""
    counts = {"colour_vision": 0, "amsler": 0, "near_va": 0}
    for f in CASE_FILES:
        for fam in counts:
            if fam in revealable_findings(_load(f)):
                counts[fam] += 1
    assert counts["colour_vision"] >= 8, counts
    assert counts["amsler"] >= 4, counts
    assert counts["near_va"] >= 3, counts


def test_marking_keys_can_never_become_a_reveal():
    """The whole reason `investigations` was not a reveal source: it also holds answer keys."""
    case = {
        "examination_findings": {},
        "investigations": {
            "ishihara_test": "13 of 14 plates correct",
            "task": "Perform Ishihara testing under daylight",
            "key_points": "SENTINEL-MARKING-KEY must never be revealed",
        },
    }
    findings = revealable_findings(case)
    assert findings.get("colour_vision") == "13 of 14 plates correct"
    assert "task" not in findings and "key_points" not in findings
    assert "SENTINEL-MARKING-KEY" not in json.dumps(findings)


def test_examination_findings_still_wins_a_conflict():
    """`examination_findings` is the authored, gated source; investigations only fills gaps."""
    findings = revealable_findings({
        "examination_findings": {"colour_vision": "AUTHORED"},
        "investigations": {"ishihara_test": "FALLBACK"},
    })
    assert findings["colour_vision"] == "AUTHORED"
