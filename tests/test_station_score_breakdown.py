"""Every number in the debrief must be traceable to an input.

Branda (2026-07-29): "it is not clear why specific scores are awarded for domains such as
Consultation & Technique, Clinical Judgment, and Safety."

The breakdown is emitted by compute_station_score — the function that already owns the
formula — so the frontend renders it rather than recomputing it. That is the whole point:
a duplicated formula in TypeScript would drift the first time the weighting changed.
"""
from tools.cases.station_score import compute_station_score

STEPS = [
    {"step_number": 1, "action": "Identify patient", "critical": True},
    {"step_number": 2, "action": "Explain procedure", "critical": False},
]
GOOD = {"history": 8, "investigations": 7, "diagnosis": 9, "management": 6}


def test_parts_explain_the_consult_total():
    out = compute_station_score(GOOD, STEPS, [1, 2], has_manual=True)
    consult = out["breakdown"]["consult"]
    assert [p["label"] for p in consult["parts"]] == ["History-taking", "Examination technique"]
    assert [p["pts"] for p in consult["parts"]] == [8, 7]
    assert consult["total"] == out["consult_technique"]
    assert consult["max"] == 50
    assert consult["capped"] is False


def test_conversation_only_cases_show_history_alone():
    """No procedures ⇒ no phantom technique score in the explanation."""
    out = compute_station_score(GOOD, STEPS, [1, 2], has_manual=False)
    parts = out["breakdown"]["consult"]["parts"]
    assert [p["label"] for p in parts] == ["History-taking"]
    assert out["breakdown"]["consult"]["total"] == out["consult_technique"]


def test_judgement_parts_explain_its_total_when_safe():
    out = compute_station_score(GOOD, STEPS, [1, 2], has_manual=True)
    judgement = out["breakdown"]["judgement"]
    assert [p["label"] for p in judgement["parts"]] == ["Recognition", "Handover & escalation"]
    assert judgement["total"] == out["judgement_safety"]
    assert judgement["capped"] is False
    assert judgement["cap_reason"] == ""


def test_safety_cap_is_explained_and_names_the_missed_step():
    """Step 1 is critical and was NOT performed."""
    out = compute_station_score(GOOD, STEPS, [2], has_manual=True)
    judgement = out["breakdown"]["judgement"]
    assert out["safe"] is False
    assert judgement["capped"] is True
    assert "Identify patient" in judgement["cap_reason"]
    assert "0.6" in judgement["cap_reason"]
    assert judgement["total"] == out["judgement_safety"]


def test_breakdown_totals_always_match_the_headline_score():
    for performed in ([], [1], [1, 2]):
        for has_manual in (True, False):
            out = compute_station_score(GOOD, STEPS, performed, has_manual=has_manual)
            b = out["breakdown"]
            assert b["consult"]["total"] + b["judgement"]["total"] == out["score_100"]
