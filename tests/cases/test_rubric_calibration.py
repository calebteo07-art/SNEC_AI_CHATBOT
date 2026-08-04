"""The grader must score to a PASS-COMPETENT standard, not a perfect one.

Trainers testing the app could not pass their own stations. The cause was not the
arithmetic — it was a hole in the calibration. `rubric_prompts.py` shipped two anchors
per domain, HIGH (8-10) and LOW (1-4), and the high anchor described an exhaustive
performance ("systematically", "comprehensive"). The whole 5-7 band — a safe, competent,
unremarkable run, which is what a real station produces — was undefined, so the model had
nowhere to put it and drifted toward the low anchor. At the old 50/50 weighting a student
needed 6/10 on all four domains to reach the 60 pass line, so that drift failed everyone.

These tests pin the fix where it lives: in the prompt. A live grading run is the only way
to watch the score move and it costs prod quota (CLAUDE.md), so they assert the
calibration is PRESENT and — just as important — that leniency did not dissolve the
bottom of the scale. A grader that cannot fail an unsafe student is worth nothing to SNEC.
"""
import json
import re

import pytest

import tools.cases.evaluate_response as ev
from tools.cases.rubric_prompts import DOMAIN_FEW_SHOTS

_DOMAINS = ("history", "investigations", "diagnosis", "management")
_STUB = {d: {"score": 7, "feedback": "ok"} for d in _DOMAINS}


@pytest.fixture
def prompt(monkeypatch) -> str:
    """The real prompt the grader is sent, captured off the real call path."""
    seen: dict[str, str] = {}

    def fake_ask(*, messages, **kw):
        seen["prompt"] = messages[0]["content"]
        return json.dumps(_STUB)

    monkeypatch.setattr(ev, "ask", fake_ask)
    ev._evaluate_all_domains("Student: hello\n\nPatient/Examiner: hi", '{"rubric":{}}')
    return seen["prompt"]


@pytest.mark.parametrize("domain", _DOMAINS)
def test_every_domain_anchors_the_competent_middle_band(domain):
    """The hole that failed the trainers: no exemplar between 'comprehensive' and 'poor'."""
    text = DOMAIN_FEW_SHOTS[domain]
    assert re.search(r"(COMPETENT|MID|PASS)[^\n]*\(5-7\)", text, re.I), (
        f"{domain} has no 5-7 band anchor — a competent run has nowhere to land"
    )


@pytest.mark.parametrize("domain", _DOMAINS)
def test_the_middle_anchor_describes_a_pass_not_a_shortfall(domain):
    """A middle band written as 'failed to be comprehensive' re-creates the drift. It has
    to read as a pass: safe, competent, covered what mattered."""
    text = DOMAIN_FEW_SHOTS[domain]
    mid = re.split(r"(COMPETENT|MID|PASS)[^\n]*\(5-7\)", text, flags=re.I)[-1].split("LOW SCORE")[0]
    assert re.search(r"competent|safe|solid|sound|pass", mid, re.I), (
        f"{domain}'s 5-7 anchor never says the performance is competent"
    )


def test_prompt_sets_a_competent_not_perfect_standard(prompt):
    assert re.search(r"competent", prompt, re.I), (
        "the prompt never tells the grader what standard to hold students to"
    )
    assert re.search(r"not.{0,40}(perfect|exhaustive|flawless|comprehensive)", prompt, re.I), (
        "the prompt must say the standard is NOT perfection"
    )


def test_prompt_resolves_a_borderline_performance_upward(prompt):
    """The single cleanest leniency lever, and the one that is honest about uncertainty:
    when the evidence is ambiguous the student gets the benefit."""
    assert re.search(r"(higher|upper)\s+(band|score)|round up|benefit of the doubt", prompt, re.I), (
        "the prompt must resolve a between-bands performance to the higher band"
    )


def test_prompt_still_says_it_is_a_formative_training_station(prompt):
    assert re.search(r"formative|learning|in training|trainee", prompt, re.I)


# --- the "still reasonable" half: leniency must not dissolve the bottom of the scale ---

@pytest.mark.parametrize("domain", _DOMAINS)
def test_the_low_band_survives_for_genuinely_poor_work(domain):
    """A grader that cannot fail an unsafe student is worth nothing. Every domain keeps a
    LOW anchor, and it still describes real failure — not a gentler version of a pass."""
    text = DOMAIN_FEW_SHOTS[domain]
    assert "LOW SCORE" in text, f"{domain} lost its low-score anchor"
    low = text.split("LOW SCORE")[1]
    assert re.search(r"→\s*Score\s*[0-4]\b", low), (
        f"{domain}'s low anchor no longer awards a failing score"
    )


def test_unsafe_recognition_is_still_a_low_score():
    """The one leniency must never reach: missing a red flag."""
    low = DOMAIN_FEW_SHOTS["diagnosis"].split("LOW SCORE")[1]
    assert re.search(r"red.?flag|unsafe|mis.?triag", low, re.I)


def test_scope_of_practice_survives_the_recalibration(prompt):
    """Pre-existing safety properties — a leniency edit must not loosen them.
    Overlaps test_rubric_applicability deliberately: that file guards applicability, this
    one guards them against the leniency change specifically."""
    assert "NOT a doctor" in prompt
    assert re.search(r"penalise.*(diagnos|prescrib)", prompt, re.I | re.S)
    assert re.search(r"do not infer|only on what appears", prompt, re.I), (
        "leniency must not become 'assume they did it'"
    )


def test_weak_domain_callout_does_not_shame_a_passing_score():
    """`_build_overall` labels weak domains for revision. Once 5-7 is a competent pass, a
    5 must not be listed as a weakness in the student's own debrief."""
    results = {d: {"score": 5, "feedback": ""} for d in _DOMAINS}
    summary = ev._build_overall(results, 20)
    assert "Focus revision on" not in summary, (
        f"a competent 5/10 in every domain is reported as a weakness: {summary!r}"
    )

    weak = {d: {"score": 3, "feedback": ""} for d in _DOMAINS}
    assert "Focus revision on" in ev._build_overall(weak, 12), (
        "a genuinely weak domain must still be called out"
    )
