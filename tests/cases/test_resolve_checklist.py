# tests/cases/test_resolve_checklist.py
"""Tests for the case -> checklist resolver and rubric-fallback builder."""
import json
from pathlib import Path

from tools.cases.resolve_checklist import (
    resolve_procedure_name,
    build_rubric_checklist,
    match_procedure,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CASES_DIR = PROJECT_ROOT / "cases"


def test_keyword_maps_nct():
    assert match_procedure("nct_glaucoma_suspect") == "Non-Contact Tonometry"


def test_keyword_maps_biometry_and_oct():
    assert match_procedure("ascan_biometry") == "Basic Biometry"
    assert match_procedure("rnfl_oct_glaucoma_monitoring") == "Cirrus OCT"


def test_dilation_beats_eye_drop():
    # dilation rule is checked before the generic eye-drop rule
    assert match_procedure("pupil_dilation_narrow_angle") == "Eye Drop Instillation and Dilation"


def test_explicit_name_wins():
    case = {"checklist_procedure": "History Taking", "topic": "nct_anything"}
    name, how = resolve_procedure_name(case)
    assert name == "History Taking"
    assert how == "explicit"


def test_ishihara_has_no_checklist():
    case = {"topic": "ishihara_colour_vision", "title": "Colour vision", "rubric": {}}
    name, how = resolve_procedure_name(case)
    assert name is None
    assert how == "rubric_fallback"


def test_build_rubric_checklist_shape():
    case = {
        "topic": "ishihara_colour_vision",
        "rubric": {
            "history": {"key_points": ["Ask about colour difficulty", "Ask occupation"]},
            "investigations": {"key_points": ["Use Ishihara plates in good light"]},
        },
    }
    cl = build_rubric_checklist(case)
    assert cl["source"] == "rubric"
    actions = [s["action"] for s in cl["steps"]]
    assert "Ask about colour difficulty" in actions
    assert len(cl["steps"]) == 3
    assert all("category" in s and "step_number" in s for s in cl["steps"])


def test_coverage_over_all_real_cases():
    """Every real case resolves to a checklist name OR the rubric fallback.
    At least 130 map to a real checklist; the rest must all carry a usable rubric."""
    mapped, fallback = 0, 0
    for cf in CASES_DIR.glob("*.json"):
        case = json.loads(cf.read_text(encoding="utf-8"))
        name, how = resolve_procedure_name(case)
        if name:
            mapped += 1
        else:
            fallback += 1
            assert build_rubric_checklist(case)["steps"], f"{cf.name} has no rubric fallback"
    assert mapped >= 130
    assert mapped + fallback == len(list(CASES_DIR.glob("*.json")))
