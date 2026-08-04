"""A chip may only reveal a finding it actually PERFORMS.

The reported bug was a chip that revealed nothing. Auditing the same mechanism across
every checklist step turned up the opposite fault, and it is worse: `_finding_for_step`
matched a finding's keywords anywhere in the step text, by plain substring, so chips
that measure nothing handed over the measurement before the student took it —

  "Check doctor's order for visual acuity - distance vision testing in patient's
   medical record / EMR."            -> revealed the VA result at step 1
  "Print out 4 Maps Cornea Topography." / "Proper disinfection of equipment"
                                     -> revealed the slit-lamp findings ("cornea")
  "Set the spherical and cylinder marking ... by adjusting the diopter knob"
                                     -> revealed the IOP ("d-IOP-ter": the _kw_hit
                                        word-boundary guard was never applied here)
  "Ensure the patient's eye is dilated before proceeding."
                                     -> revealed the fundus findings ("dilated")

and build_actions' merge then spread one such reveal across every step sharing the label.

The invariant: a finding belongs to the chip that performs it (FINDING_LABELS), and
nothing else may show it. Everything below is a real (checklist, step) pair.
"""

import json
from pathlib import Path

from tools.cases.examination_actions import (
    FINDING_LABELS,
    _STEP_KEYWORDS,
    build_actions,
)

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "procedure_checklists.json"
CHECKLISTS = json.loads(FIXTURE.read_text(encoding="utf-8"))
CASES = sorted((Path(__file__).resolve().parents[2] / "cases").glob("*.json"))

# One value per family, distinctive enough that a leak is unmistakable in the assertion.
FINDINGS = {
    "va": {"right": "6/12 SENTINEL-VA", "left": "6/9 SENTINEL-VA"},
    "near_va": "N8 SENTINEL-NEARVA",
    "iop": {"right": "17 mmHg SENTINEL-IOP", "left": "16 mmHg SENTINEL-IOP"},
    "anterior_segment": "SENTINEL-ANTSEG cornea clear",
    "fundus": "SENTINEL-FUNDUS disc healthy",
    "colour_vision": "SENTINEL-COLOUR 14/14 plates",
    "amsler": "SENTINEL-AMSLER no distortion",
}


def _chips(procedure: str) -> dict[str, dict]:
    cl = next(c for c in CHECKLISTS if c["procedure_name"] == procedure)
    return {a["label"]: a for a in build_actions(FINDINGS, cl["steps"])}


def test_the_doctor_order_chip_does_not_reveal_the_visual_acuity():
    """Step 1 of the VA checklist names "visual acuity" only to say it was ordered."""
    chip = _chips("Distance Vision Testing LogMAR")["Check doctor's order"]
    assert "SENTINEL" not in chip["reveal_text"], chip["reveal_text"]


def test_housekeeping_chips_do_not_reveal_the_anterior_segment():
    chips = _chips("Cornea Topography")
    for label in ("Disinfect equipment", "Print results", "Check doctor's order"):
        assert "SENTINEL" not in chips[label]["reveal_text"], label


def test_the_lens_meter_diopter_knob_does_not_reveal_the_iop():
    """"d-IOP-ter" is not tonometry — the same word-boundary bug _kw_hit fixed for labels."""
    for label, chip in _chips("Lens Meter Investigation").items():
        assert "SENTINEL-IOP" not in chip["reveal_text"], label


def test_the_dilation_precheck_does_not_reveal_the_fundus():
    chip = _chips("Macula Potential (Acuity Test) Investigation")["Check dilation"]
    assert "SENTINEL" not in chip["reveal_text"], chip["reveal_text"]


def test_the_correct_eye_safety_check_does_not_reveal_the_fundus():
    chip = _chips("Eye Drop Instillation and Dilation")["Safety check"]
    assert "SENTINEL" not in chip["reveal_text"], chip["reveal_text"]


def test_the_tonometer_alignment_step_does_not_reveal_the_anterior_segment():
    """"a vague alignment dot ... reflected in the cornea" is aiming, not a slit lamp."""
    chip = _chips("Non-Contact Tonometry")["Align & focus"]
    assert "SENTINEL" not in chip["reveal_text"], chip["reveal_text"]


def test_the_performing_chip_still_reveals_its_own_finding():
    """The other half of the invariant — gating must not mute the real measurement."""
    assert "SENTINEL-VA" in _chips("Distance Vision Testing LogMAR")["Test distance VA"]["reveal_text"]
    assert "SENTINEL-VA" in _chips("Distance Vision Testing LogMAR")["Pinhole test"]["reveal_text"]
    assert "SENTINEL-NEARVA" in _chips("Near Vision Testing (SOP)")["Test near VA"]["reveal_text"]
    assert "SENTINEL-IOP" in _chips("Non-Contact Tonometry")["Measure IOP"]["reveal_text"]
    assert "SENTINEL-IOP" in _chips("Non-Contact Tonometry (SOP)")["Operate machine"]["reveal_text"]
    assert "SENTINEL-COLOUR" in _chips("Ishihara Colour Vision Testing")["Colour vision"]["reveal_text"]
    assert "SENTINEL-AMSLER" in _chips("Amsler Grid Testing")["Amsler grid"]["reveal_text"]


def test_no_chip_in_any_real_checklist_reveals_a_finding_it_does_not_perform():
    """The sweep: 21 checklists x every step. This is the guard that caught the leak."""
    leaks = []
    for cl in CHECKLISTS:
        actions = build_actions(FINDINGS, cl["steps"])
        for a in actions:
            if not a["reveal_text"]:
                continue
            for key, value in FINDINGS.items():
                token = f"SENTINEL-{key.replace('_', '').upper()}"
                if token in a["reveal_text"] and a["label"] not in FINDING_LABELS[key]:
                    leaks.append(f"{cl['procedure_name']} '{a['label']}' -> {key}")
    assert leaks == [], leaks


def test_every_finding_family_a_real_case_uses_is_mapped():
    """Fail closed: an unmapped family reveals NOWHERE, which would be silent data loss.

    A new finding key (say "oct") must be given its performing chip deliberately, not
    discovered missing by a student clicking through a station.
    """
    used: set[str] = set()
    for p in CASES:
        used |= set((json.loads(p.read_text(encoding="utf-8")).get("examination_findings") or {}))
    assert used, "no case findings loaded — the guard would pass vacuously"
    unmapped = {k for k in used if k not in FINDING_LABELS and k not in _STEP_KEYWORDS}
    assert unmapped == set(), unmapped
    assert {k for k in used if k in _STEP_KEYWORDS} <= set(FINDING_LABELS), used
