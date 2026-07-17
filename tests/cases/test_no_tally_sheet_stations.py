# tests/cases/test_no_tally_sheet_stations.py
"""Guard: a case must never resolve to a supervisor LOGBOOK TALLY SHEET.

Five rows in the Supabase `checklists` table are not procedure checklists at all — they
are the logbook tally sheets a preceptor signs after observing a student on N real
patients. Every "step" is the same roster row repeated ("Record patient's Date, Age,
Sex, Race; ... Obtain preceptor's Name and Signature", x5), so a station that resolves
to one has no procedure to perform. Measured over the real /api/cases/{id}/station
endpoint when this was found:

    case_oa_004_preop                  -> "Dayward and OT Skills Observation"  -> 1 chip
    case_ot_016_versions_and_ductions  -> "Orthoptics Skills Observation"      -> 0 chips

A tally sheet is identified by "Skills Observation" in the procedure name.
`checklist_type` is NOT a usable discriminator: Ishihara Colour Vision Testing, Amsler
Grid Testing and I-Care Competency are REAL procedures that are also tagged 'logbook'.

26 cases were affected. 11 were fixed in 780854b by authoring the five ophthalmic
investigation checklists from the SNEC Procedure Manual. This file exists so that fix
cannot silently rot, and so the remaining 15 stay visible rather than becoming folklore.

The backlog is asserted EXACTLY, so it can only shrink: fixing a case fails this test
until it is removed from the list, and a new case regressing onto a tally sheet fails it
too.
"""
import json
from pathlib import Path

import pytest

from tools.cases.resolve_checklist import is_tally_sheet, resolve_procedure_name

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CASES_DIR = PROJECT_ROOT / "cases"
CASE_FILES = sorted(CASES_DIR.glob("case_*.json"))

# Cases still pointed at a logbook tally sheet. NOT an acceptable state — a tracked
# backlog. SNEC has no step-by-step procedure for day-ward or orthoptics anywhere in the
# KB (it assesses those by preceptor logbook sign-off), so a real checklist for these
# has to be authored and clinically signed off. Remove an entry once its checklist is
# authored, seeded, and the case re-pointed.
#
# Note the failure mode that makes "just point it somewhere" wrong: get_checklist_by_name
# swallows its exceptions and returns None, so pointing a case at a checklist that isn't
# in the database degrades the station to the case's own rubric — silently, and no worse
# than the tally sheet it came from.
PENDING_CLINICAL_REVIEW = {
    # day ward / peri-operative (8)
    "case_oa_004_preop",
    "case_oa_005_postop",
    "case_oa_021_preop_counselling_cataract",
    "case_oa_022_dayward_postop_monitoring",
    "case_oa_045_postop_dressing_observation_cataract",
    "case_ot_004_dayward",
    "case_ot_047_dayward_preop_assessment_dism",
    "case_ot_048_dayward_postop_monitoring_discharge",
    # orthoptics (4)
    "case_ot_016_versions_and_ductions",
    "case_ot_020_cover_uncover_test_strabismus",
    "case_ot_021_npc_convergence_insufficiency",
    "case_ot_045_hirschberg_krimsky_child_esotropia",
    # imaging / grading (3)
    "case_ot_007_asoct_angle_assessment",
    "case_ot_053_retinal_imaging_fundus_photography",
    "case_ot_054_dr_grading_sorc",
}

TALLY_SHEETS = [
    "Dayward and OT Skills Observation",
    "OPD Skills Observation",
    "Ophthalmic Investigations Skills Observation",
    "Optometry Skills Observation",
    "Orthoptics Skills Observation",
]

# Real procedures ALSO tagged checklist_type='logbook' — the trap that makes
# checklist_type unusable as the discriminator.
REAL_LOGBOOK_TAGGED_PROCEDURES = [
    "Ishihara Colour Vision Testing",
    "Amsler Grid Testing",
    "I-Care Competency",
]

# The 11 fixed in 780854b, pinned by name so a silent re-point fails here.
FIXED_BY_AUTHORED_CHECKLIST = {
    "case_ot_022_pam_dense_cataract": "Macula Potential (Acuity Test) Investigation",
    "case_ot_028_pam_good_potential_dense_cataract": "Macula Potential (Acuity Test) Investigation",
    "case_ot_029_pam_poor_potential_macular_amd": "Macula Potential (Acuity Test) Investigation",
    "case_ot_030_pam_diabetic_maculopathy_assessment": "Macula Potential (Acuity Test) Investigation",
    "case_ot_031_potential_acuity_meter_technique": "Macula Potential (Acuity Test) Investigation",
    "case_ot_005_endothelial": "Endothelial Cell Count Investigation",
    "case_ot_043_endothelial_cell_count_low_fuchs": "Endothelial Cell Count Investigation",
    "case_ot_019_flare_test_uveitis_monitoring": "Flare Cell Measurement Investigation",
    "case_ot_044_flare_test_postop_inflammation": "Flare Cell Measurement Investigation",
    "case_ot_051_aberrometry_wavefront": "Aberrometry Investigation",
    "case_ot_052_lens_meter_focimetry": "Lens Meter Investigation",
}


def _resolve(case_file: Path) -> str | None:
    return resolve_procedure_name(json.loads(case_file.read_text(encoding="utf-8")))[0]


@pytest.mark.parametrize("name", TALLY_SHEETS)
def test_is_tally_sheet_flags_every_tally_sheet(name):
    assert is_tally_sheet(name) is True


@pytest.mark.parametrize("name", REAL_LOGBOOK_TAGGED_PROCEDURES)
def test_is_tally_sheet_does_not_flag_real_logbook_tagged_procedures(name):
    """checklist_type='logbook' must never be what makes a checklist a tally sheet."""
    assert is_tally_sheet(name) is False


def test_is_tally_sheet_ignores_case_and_blanks():
    assert is_tally_sheet("orthoptics skills observation") is True
    assert is_tally_sheet("") is False
    assert is_tally_sheet(None) is False


@pytest.mark.parametrize(
    "case_file",
    [p for p in CASE_FILES if p.stem not in PENDING_CLINICAL_REVIEW],
    ids=lambda p: p.stem,
)
def test_no_case_resolves_to_a_tally_sheet(case_file):
    """The invariant: a station is a procedure, never a preceptor's tally sheet."""
    name = _resolve(case_file)
    assert not is_tally_sheet(name), (
        f"{case_file.name} resolves to the logbook tally sheet {name!r}, which has no "
        f"performable steps — the station renders a near-empty action panel."
    )


def test_pending_backlog_is_exact():
    """The backlog may only shrink.

    Fixing a case fails here until it is removed from PENDING_CLINICAL_REVIEW; a new
    case regressing onto a tally sheet fails here too.
    """
    actual = {p.stem for p in CASE_FILES if is_tally_sheet(_resolve(p))}
    fixed = PENDING_CLINICAL_REVIEW - actual
    assert not fixed, (
        "these cases no longer resolve to a tally sheet — remove them from "
        f"PENDING_CLINICAL_REVIEW: {sorted(fixed)}"
    )
    regressed = actual - PENDING_CLINICAL_REVIEW
    assert not regressed, (
        "these cases newly resolve to a logbook tally sheet, so their station has no "
        f"performable steps: {sorted(regressed)}"
    )


@pytest.mark.parametrize("case_id,expected", sorted(FIXED_BY_AUTHORED_CHECKLIST.items()))
def test_fixed_cases_resolve_to_their_authored_checklist(case_id, expected):
    assert _resolve(CASES_DIR / f"{case_id}.json") == expected


def test_no_keyword_rule_points_at_a_tally_sheet_for_a_solved_procedure():
    """The rules that still name a tally sheet must be only the unsolved ones.

    A rule pointing at a tally sheet is a station with nothing to perform, so the set is
    pinned: adding a new one fails here.
    """
    from tools.cases.resolve_checklist import KEYWORD_RULES

    offenders = {name for _, name in KEYWORD_RULES if is_tally_sheet(name)}
    assert offenders == {
        "Dayward and OT Skills Observation",
        "Orthoptics Skills Observation",
        "Ophthalmic Investigations Skills Observation",
    }, f"unexpected tally-sheet keyword rules: {sorted(offenders)}"
