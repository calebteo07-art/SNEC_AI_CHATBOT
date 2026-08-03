"""The grader must score what THIS case calls for, not a generic wish-list.

Branda (2026-08-03), on Submit handover: "Some of the items required in the handover
submission may not be applicable to every scenario. For example, assessments such as
visual acuity or colour vision testing for follow up pt may not need prioritising the
pt as they follow the appointment time."

She is right, and the penalty was real. Every case ships its own `rubric.key_points`
per domain plus an expected `management` plan (155/155 cases have all four domains) —
and both already reach the grader inside `case_context`. But nothing told the grader
they were the standard, while the generic few-shot anchors said, flatly, that a student
who "did not escalate/refer" scores 1-4. On a routine follow-up (case_oa_002_iop_va:
"Record VA and IOP accurately… hand over documentation to doctor for review") the
correct plan IS "routine, patient keeps their appointment" — and the anchor marked that
correct answer down. The station UI meanwhile promises the opposite in as many words:
"Not every case needs escalation: if nothing is urgent, say so."

These tests pin the applicability rule at the prompt, which is where it lives. A live
grading run would be the only way to observe the score move, and that costs prod quota.
"""
import json
import re

import pytest

import tools.cases.evaluate_response as ev
from tools.cases.rubric_prompts import DOMAIN_FEW_SHOTS

_STUB = {d: {"score": 7, "feedback": "ok"} for d in ("history", "investigations", "diagnosis", "management")}


@pytest.fixture
def prompt(monkeypatch) -> str:
    """The real prompt the grader is sent, captured off the real call path.

    Deliberately not a pure prompt-builder helper: capturing at `ask` means a refactor
    that stops routing through the builder still has to satisfy these tests.
    """
    seen: dict[str, str] = {}

    def fake_ask(*, messages, **kw):
        seen["prompt"] = messages[0]["content"]
        return json.dumps(_STUB)

    monkeypatch.setattr(ev, "ask", fake_ask)
    ev._evaluate_all_domains("Student: hello\n\nPatient/Examiner: hi", '{"rubric":{}}')
    return seen["prompt"]


def test_prompt_makes_the_cases_own_rubric_the_standard(prompt):
    """`rubric.key_points` is shipped with every case and already in the context block —
    the grader has to be told to grade against it."""
    assert "key_points" in prompt, "the prompt never points the grader at the case's own rubric"


def test_prompt_says_an_item_the_case_does_not_call_for_is_not_an_omission(prompt):
    """The whole of Branda's complaint, in one sentence of prompt."""
    assert re.search(r"not\s+(an?\s+)?(omission|gap|miss)", prompt, re.I), (
        "the prompt must say that an inapplicable item is not an omission"
    )


def test_prompt_allows_full_marks_when_nothing_needs_escalating(prompt):
    """Her example: a follow-up patient who simply keeps their appointment.

    Both halves must sit in ONE claim. Searching the whole prompt for them separately
    passes on today's text by accident — "no escalation" already appears in the
    very-low-score anchor and "Score 10." in three others.
    """
    hits = [
        prompt[m.start():m.start() + 220]
        for m in re.finditer(r"(no|nothing|does not)\s+\w*\s*(need\w*\s+)?escalat", prompt, re.I)
    ]
    assert any(re.search(r"full marks|top of the (range|scale)|still score", w, re.I) for w in hits), (
        "the prompt must say, in one place, that a correct routine plan still scores at the top"
    )


def test_management_anchor_shows_a_full_marks_routine_encounter():
    """A calibration anchor the grader can copy from — the generic one only ever
    modelled an escalation."""
    high = DOMAIN_FEW_SHOTS["management"].split("LOW SCORE")[0]
    assert re.search(r"routine", high, re.I), "no routine exemplar in the high-score anchor"
    assert re.search(r"(no|nothing)\s+\w*\s*escalat", high, re.I), (
        "the high-score anchor must include an encounter that correctly escalates nothing"
    )


def test_management_low_anchor_does_not_punish_a_correct_routine_plan():
    """"Did not escalate" alone must never be a low-score trigger — only failing to
    escalate something that NEEDED escalating."""
    low = DOMAIN_FEW_SHOTS["management"].split("LOW SCORE")[1]
    for m in re.finditer(r"(did not|failed to|no)\s+escalat\w*(/refer\w*)?", low, re.I):
        tail = low[m.end():m.end() + 90]
        assert re.search(r"need|requir|warrant|urgen|red.?flag", tail, re.I), (
            f"unqualified escalation penalty in the low-score anchor: {m.group(0)!r} → {tail!r}"
        )


@pytest.mark.parametrize("domain", ["history", "investigations"])
def test_other_anchors_are_scoped_to_the_scenario(domain):
    """Same defect, quieter: the history anchor listed family history and occupational
    visual requirements as if every encounter needed them."""
    high = DOMAIN_FEW_SHOTS[domain].split("LOW SCORE")[0]
    assert re.search(r"this (case|scenario|encounter)|the case calls for|scenario calls for", high, re.I), (
        f"the {domain} high-score anchor reads as a fixed checklist, not as what this case needs"
    )


def test_scope_of_practice_guarantees_survive(prompt):
    """Pre-existing safety properties — an applicability edit must not loosen them."""
    assert "NOT a doctor" in prompt
    assert re.search(r"penalise.*(diagnos|prescrib)", prompt, re.I | re.S)
    assert re.search(r"over.?step|outside scope", DOMAIN_FEW_SHOTS["management"], re.I)
    assert re.search(r"red flag", DOMAIN_FEW_SHOTS["diagnosis"], re.I)


def test_grader_still_scores_only_what_the_transcript_shows(prompt):
    """The other half of fairness: applicability must not become 'assume they did it'."""
    assert re.search(r"do not infer|only on what appears", prompt, re.I)
