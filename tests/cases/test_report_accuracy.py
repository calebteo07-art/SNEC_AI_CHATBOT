# tests/cases/test_report_accuracy.py
"""Every bucket of the 40/30/30 must carry a remark, and no remark may outlive its bucket.

Reported 2026-08-04: "osce report not accurate in terms of the 40/30/30 remarks/comments."
Two defects sat in the report:

  1. Checklist coverage — the LARGEST bucket, 40 of the 100 — had no remark at all. The two
     30-point buckets each carried two AI paragraphs; the 40-point one carried nothing, so
     the biggest number on the page was the one the student got no comment on.
  2. On a case with no manual procedures, `investigations` scores ZERO of Consultation &
     Technique (station_score blends history alone) and the bucket's own `parts` list drops
     "Examination technique" — but the report still printed the examination-technique
     paragraph underneath it. A remark with no points behind it, contradicting the sub-score
     list directly above it. Pinned on the frontend by scoreBuckets_logic.mjs.

This file covers (1) at its source: station_score owns the formula, so it owns the
explanation — a note built in the frontend would drift the first time weighting changed.
The note is SNEC's own: each step's `notes` field is the institution's reason the step
exists, which is what makes "you skipped this" into feedback rather than a tally.
"""
from tools.cases.station_score import compute_station_score

STEPS = [
    {"step_number": 1, "action": "Perform hand hygiene and confirm patient identity",
     "critical": True, "notes": "Wrong-patient testing invalidates the whole record."},
    {"step_number": 2, "action": "Wipe the occluder with an alcohol wipe",
     "critical": False, "notes": "Shared occluders transmit adenoviral conjunctivitis."},
    {"step_number": 3, "action": "Take three readings per eye and record the average",
     "critical": False, "notes": "A single reading is not repeatable enough to act on."},
]
DOMAINS = {"history": 7, "investigations": 7, "diagnosis": 7, "management": 7}


def _note(performed, steps=STEPS):
    return compute_station_score(DOMAINS, steps, performed)["breakdown"]["checklist"]["note"]


def test_the_40_point_bucket_is_never_left_without_a_remark():
    assert _note([1, 2, 3]).strip(), "full coverage still needs a remark"
    assert _note([1]).strip(), "partial coverage needs a remark"
    assert _note([]).strip(), "zero coverage needs a remark"


def test_full_coverage_says_so_and_does_not_invent_a_gap():
    note = _note([1, 2, 3])
    assert "3" in note
    for s in STEPS:
        assert s["action"] not in note, "nothing was missed — no step may be named as a gap"


def test_a_missed_step_is_named_with_what_it_costs():
    # The bare step list already shows WHICH steps went unticked. The remark earns its place
    # only by carrying SNEC's reason the step exists.
    note = _note([1, 3])
    assert STEPS[1]["action"] in note
    assert STEPS[1]["notes"] in note


# ── The safety-ordering rule needs a fixture that can FAIL ────────────────────
# The rule: a missed CRITICAL step must lead the remark, because it is the reason for the
# x0.6 safety cap on Judgement. `station_score` implements it with a stable sort on
# `not critical`.
#
# Every fixture above puts the critical step at step_number 1 — FIRST in step order — so
# the sort is a no-op on all of them and the two tests below passed with the sort deleted
# entirely. (Mutation-proved: removing the sort, and replacing it with a sort by
# step_number, both left the file green.) `note.index(x) < len(note)` was worse than
# useless: `str.index` on a needle already asserted present ALWAYS returns < len.
#
# CRITICAL_LAST puts the critical step LAST in step order, so the assertion below fails
# unless the sort actually runs.
CRITICAL_LAST = [
    {"step_number": 1, "action": "Wipe the occluder with an alcohol wipe",
     "critical": False, "notes": "Shared occluders transmit adenoviral conjunctivitis."},
    {"step_number": 2, "action": "Take three readings per eye and record the average",
     "critical": False, "notes": "A single reading is not repeatable enough to act on."},
    {"step_number": 3, "action": "Confirm patient identity before testing",
     "critical": True, "notes": "Wrong-patient testing invalidates the whole record."},
]


def test_a_missed_critical_step_leads_the_remark():
    """The critical step is LAST in step order — only the safety sort can bring it first."""
    note = _note([1, 2], steps=CRITICAL_LAST)      # only the critical step (3) missed... no:
    # steps 1 and 2 performed, so step 3 (critical) is the sole miss.
    assert CRITICAL_LAST[2]["action"] in note


def test_criticals_lead_even_when_a_non_critical_was_missed_first():
    """The one that mutation-kills the sort: a non-critical is missed EARLIER in step order,
    so document order and safety order disagree and only one of them can win."""
    note = _note([2], steps=CRITICAL_LAST)         # steps 1 (non-critical) and 3 (critical) missed
    crit = note.index(CRITICAL_LAST[2]["action"])
    non_crit = note.index(CRITICAL_LAST[0]["action"])
    assert crit < non_crit, (
        f"the missed CRITICAL step must be named first — it is the reason for the safety "
        f"cap — but the remark leads with the non-critical one:\n{note}"
    )


def test_relative_order_is_otherwise_preserved():
    """The sort must be STABLE: among equally-critical steps, step order still holds, so
    the remark reads in the order the student worked."""
    note = _note([3], steps=CRITICAL_LAST)         # steps 1 and 2 missed, neither critical
    assert note.index(CRITICAL_LAST[0]["action"]) < note.index(CRITICAL_LAST[1]["action"]), note


def test_the_remark_does_not_run_away_with_every_missed_step():
    note = _note([])           # all three missed
    assert "more" in note.lower(), "a long tail of misses must be summarised, not listed"


def test_no_checklist_means_no_remark_rather_than_a_fake_one():
    # Matches the existing `parts` rule: with no steps there is no arithmetic to show, and
    # "0/0 -> 40/40" reads as a bug.
    assert compute_station_score(DOMAINS, [], [])["breakdown"]["checklist"]["note"] == ""


def test_the_other_two_buckets_still_carry_their_own_keys():
    b = compute_station_score(DOMAINS, STEPS, [1, 2, 3])["breakdown"]
    for bucket in ("checklist", "consult", "judgement"):
        assert "note" in b[bucket], f"{bucket} lost the note key the API model expects"


def test_the_note_survives_the_api_response_model():
    from tools.api.routers.cases import ScoreBreakdown
    b = compute_station_score(DOMAINS, STEPS, [1, 3])["breakdown"]
    assert ScoreBreakdown(**b).checklist.note == b["checklist"]["note"]
