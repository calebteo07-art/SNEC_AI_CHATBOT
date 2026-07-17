# tests/cases/test_rubric_fallback_is_logged.py
"""A station that falls back to the case's own rubric must say so.

_station_checklist funnels three DIFFERENT failures into one silent `return`:

  1. no keyword rule matched and the case names no checklist  -> name is None
  2. the name isn't in Supabase (typo'd, or authored but never seeded)
  3. get_checklist_by_name threw and swallowed the exception into None

All three degrade the station to a checklist built from rubric.key_points — which are
third-person marking descriptors ("Asks about fasting status"), not steps a student
performs, so the action panel comes out near-empty. None of them raise, and the endpoint
still returns 200, so the only signal is a station that quietly teaches nothing.

Measured on the real bank when this was written: rubric-derived steps are 87% unmatched
by the action-panel label rules, so the fallback is a broken station, not a soft landing.
It currently never fires (all 155 cases resolve to a real checklist) — which is exactly
why it needs a log line: the day it starts firing must not be silent.
"""
from unittest.mock import patch

from tools.api.routers.cases import _station_checklist

CASE = {
    "case_id": "case_ot_999_probe",
    "topic": "lens_meter_focimetry",
    "rubric": {"investigations": {"key_points": ["Reads the spectacle power"]}},
}


def test_resolved_checklist_found_in_db_does_not_log_a_fallback(capsys):
    """The healthy path must stay quiet, or the log is noise nobody reads."""
    checklist = {
        "procedure_name": "Lens Meter Investigation",
        "steps": {"steps": [{"step_number": 1, "action": "Switch on the Lensmeter."}]},
    }
    with patch("tools.api.routers.cases.get_checklist_by_name", return_value=checklist):
        out = _station_checklist(CASE)
    assert out["source"] == "checklist"
    assert "rubric-fallback" not in capsys.readouterr().out


def test_name_resolved_but_missing_from_db_logs_the_fallback(capsys):
    """The dangerous case: an authored-but-unseeded name. Silent today."""
    with patch("tools.api.routers.cases.get_checklist_by_name", return_value=None):
        out = _station_checklist(CASE)
    assert out["source"] == "rubric"
    log = capsys.readouterr().out
    assert "[station-rubric-fallback]" in log
    assert "case_ot_999_probe" in log
    # The resolved name is the actionable detail — it says WHAT to go and seed.
    assert "Lens Meter Investigation" in log


def test_unresolved_case_logs_the_fallback(capsys):
    """No rule matched and no explicit checklist_procedure."""
    case = {"case_id": "case_zz_000", "topic": "no_rule_matches_this", "rubric": {}}
    with patch("tools.api.routers.cases.get_checklist_by_name", return_value=None):
        out = _station_checklist(case)
    assert out["source"] == "rubric"
    log = capsys.readouterr().out
    assert "[station-rubric-fallback]" in log
    assert "case_zz_000" in log
