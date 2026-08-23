"""The cohort-insight BRIEF: what the narrative model is allowed to know and say.

Reported from production. The console printed, as a quoted line under the hero:

    "...a systemic failure in foundational optics and clinical triage. Immediately
     pause new instruction..."

Neither topic exists in this product's data. The brief it was given listed "Ocular
Anatomy, Microbiology, Eyelid & Lacrimal" — the model was handed three topic names and
emitted two different ones, then escalated to a teaching directive off a brief that
contained no score, no pass rate and no attempt count at all.

That is not a prompt-quality nitpick; it is the console asserting a clinical-education
finding that its own panels contradict, six inches below a card correctly reading "—".

So the brief is built HERE, deterministically, and asserted:

* every figure the model may use is named, and named ONCE;
* the weakest-topic list is CLOSED and says so, because an open list is what let two
  invented topics through;
* the flag REASONS are aggregated, because "13 of 13 flagged for inactivity, 0 for OSCE
  failure" is the actual story and is free — at_risk already computed it;
* anything the brief does NOT carry is stated as absent rather than omitted. Silence is
  what the model filled in.
"""
from tools.supervisor.insight_context import INSIGHT_SYSTEM, build_insight_context


def _cohort(**over):
    base = {
        "total": 13, "staff_excluded": 2, "active_this_week": 1, "at_risk_count": 13,
        "inactive_7_plus_days": [{"student_id": f"s{i}"} for i in range(12)],
        "weakest_topics": [
            {"topic": "Ocular Anatomy", "count": 7},
            {"topic": "Microbiology", "count": 4},
        ],
    }
    base.update(over)
    return base


def _flagged(n=13, factor="inactivity"):
    return [{"student_id": f"s{i}", "band": "high", "risk_score": 80,
             "reasons": [{"factor": factor, "weight": 60.0, "detail": "No activity for 83 days"}]}
            for i in range(n)]


# ── the closed topic list ────────────────────────────────────────────────────

def test_every_weakest_topic_is_named_in_the_brief():
    ctx = build_insight_context(_cohort(), _flagged())
    assert "Ocular Anatomy" in ctx and "Microbiology" in ctx


def test_the_topic_list_is_declared_closed():
    """THE REGRESSION. An open list is an invitation to supply a better-sounding one."""
    ctx = build_insight_context(_cohort(), _flagged())
    assert "only topic" in ctx.lower()


def test_an_empty_topic_list_says_so_rather_than_going_silent():
    """An omitted line reads as "unconstrained", which is how "optics" got written."""
    ctx = build_insight_context(_cohort(weakest_topics=[]), _flagged())
    assert "none recorded" in ctx.lower()
    assert "only topic" in ctx.lower()


def test_the_system_prompt_forbids_naming_a_topic_outside_the_list():
    s = INSIGHT_SYSTEM.lower()
    assert "only" in s and "topic" in s
    assert "do not name" in s or "must not name" in s


def test_the_system_prompt_forbids_a_performance_verdict():
    """The brief carries no score data, so a score claim can only be invented."""
    s = INSIGHT_SYSTEM.lower()
    assert "score" in s and ("do not" in s or "must not" in s)


def test_the_system_prompt_permits_having_no_recommendation():
    """"The single most important action" FORCES a directive off any brief at all.

    That framing is what turned a dormant-cohort brief into "immediately pause new
    instruction". The model must be allowed to say the evidence is thin.
    """
    assert "if the brief does not support" in INSIGHT_SYSTEM.lower()


# ── the figures ──────────────────────────────────────────────────────────────

def test_the_brief_states_the_absence_of_score_data():
    ctx = build_insight_context(_cohort(), _flagged()).lower()
    assert "no osce score" in ctx


def test_flag_reasons_are_aggregated_so_the_real_story_is_in_the_brief():
    """13 flagged for INACTIVITY is a different cohort from 13 flagged for FAILING.

    Both render as "At-risk: 13" — the only figure the old brief carried.
    """
    ctx = build_insight_context(_cohort(), _flagged(13, "inactivity")).lower()
    # The factor is labelled in plain English, so the brief never leaks a raw key —
    # but the count must ride with it, or the line says nothing a header did not.
    assert "inactivity (no recent activity): 13" in ctx


def test_a_failing_cohort_and_a_dormant_one_produce_different_briefs():
    dormant = build_insight_context(_cohort(), _flagged(13, "inactivity"))
    failing = build_insight_context(_cohort(), _flagged(13, "osce_failure"))
    assert dormant != failing


def test_the_brief_carries_the_headcount_and_the_active_split():
    ctx = build_insight_context(_cohort(), _flagged())
    assert "13" in ctx and "1" in ctx
    assert "active" in ctx.lower()


def test_a_cohort_with_nobody_flagged_is_stated_not_omitted():
    ctx = build_insight_context(_cohort(at_risk_count=0), []).lower()
    assert "none" in ctx or "0" in ctx


def test_the_brief_never_invents_a_denominator_it_was_not_given():
    """No key here supplies a pass rate, so no percentage may appear beside one."""
    ctx = build_insight_context(_cohort(), _flagged())
    assert "pass rate" not in ctx.lower().replace("no osce score, pass rate", "")


def test_missing_keys_degrade_instead_of_raising():
    """A partial cohort dict must not 500 the endpoint — the narrative is optional."""
    ctx = build_insight_context({}, [])
    assert isinstance(ctx, str) and ctx.strip()


def test_malformed_reason_rows_are_skipped_not_crashed():
    rows = [{"student_id": "s1", "band": "high", "reasons": None},
            {"student_id": "s2", "band": "high", "reasons": [{"weight": 1.0}]}]
    ctx = build_insight_context(_cohort(), rows)
    assert isinstance(ctx, str) and ctx.strip()
