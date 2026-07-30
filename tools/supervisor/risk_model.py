"""Deterministic, explainable at-risk scoring (spec §6.1, D7).

Pure: no I/O, no DB, no clock. Takes already-computed per-student signals and
returns `{risk_score, band, reasons}`. `at_risk.py` owns the reads; this module owns
the weight policy, so the policy is testable without a database and a weight change
cannot accidentally become a query change.

Replaces a single binary rule — `days_inactive >= 5 AND len(weak_topics) >= 2` — that
carried no score, no reason and no performance signal at all. That rule survives as
ONE input (`inactivity` plus `weak_breadth`), which is D7's "the old binary rule
becomes one input".

Three rules, each an inversion of the feature if broken:

* **Missing signals are excluded and the remaining weights renormalise to 100.**
  Zero-filling an absent signal scores a student with no data as the SAFEST in the
  cohort. Renormalising means every student is judged only on the evidence they have.
* **A profile-fact signal counts only once the student has started, and
  `streak_broken` only once they have also gone quiet.** A new account has
  `streak == 0` and `weak_topics == []`; crediting `streak_broken` there flags every
  new account on day one. `inactivity` and `weak_breadth` require
  `days_inactive is not None`; `streak_broken` additionally requires
  `days_inactive > 0` — not checking in TODAY is normal for an otherwise-active
  student, so a broken streak is only evidence once the student has ALSO stopped
  showing up. A student with neither profile activity nor performance rows is
  `no_data` with `risk_score: None` — not a fabricated 0.
* **Shrinkage applies to sampled signals only.** `graded_n`, `safety_gradable_n` and
  flashcard `n` are samples; at ~24 OSCE attempts across 10 students a single attempt
  is the common case and undamped it carries a full deficit of 1.0. Inactivity and
  streak are facts about the profile, not samples of size 1, so shrinking them would
  report "inactive 14 days, 5 weak topics, no other signal" as 25/100.
"""
from __future__ import annotations

from tools.supervisor.cohort_analytics import SHRINKAGE_K, WEIGHT_RUBRIC, _unit

# Days of inactivity that count as a full-deficit signal. The old rule fired a binary
# flag at 5; a ramp to 14 means "5 days off" and "a month gone" are no longer equal.
INACTIVITY_FULL_DAYS: int = 14
# Weak topics that count as full breadth. The old rule fired at 2; 5 is the point at
# which "a couple of gaps" becomes "not coping with the syllabus".
WEAK_BREADTH_FULL: int = 5

RISK_RUBRIC: dict = {
    "version": 1,
    # Sum to 1.0, then renormalised over the signals actually present.
    #
    # PERFORMANCE OUTWEIGHS ENGAGEMENT, 0.70 to 0.30, and the split is load-bearing —
    # but only once performance signals exist. For a student with no OSCE/flashcard
    # rows at all, renormalisation has nothing else to divide over, so the rubric is
    # necessarily 100% engagement for that student. That is correct, not a bug: it is
    # the only evidence there is.
    # An engagement-heavy rubric scores the headline case wrong: a student active daily
    # with a 9-day streak who failed 12 of 12 graded attempts with a safety fail on
    # every one comes out ~33/100 — "low", i.e. not flagged — because three zero-deficit
    # engagement signals hold nearly half the renormalised budget and dilute the
    # catastrophe. Surfacing exactly that student is why P2b exists.
    "weights": {
        "osce_failure": 0.30,    # graded attainment — the richest evidence by far
        "safety": 0.22,          # a safety fail matters out of proportion to frequency
        "flashcard": 0.18,       # recall, not performance, but still real evidence
        "inactivity": 0.18,      # the strongest ENGAGEMENT predictor of dropping out
        "streak_broken": 0.06,   # habit, and already partly inside `inactivity`
        "weak_breadth": 0.06,    # self-reported/derived gaps — the weakest evidence
    },
    "inactivity_full_days": INACTIVITY_FULL_DAYS,
    "weak_breadth_full": WEAK_BREADTH_FULL,
    # risk_score >= high -> "high"; >= medium -> "medium"; else "low".
    #
    # Calibrated to the range the shrinkage term can actually reach, not to round
    # numbers. A student whose ONLY signal is OSCE failure caps at
    # n/(n+5) * 100, so 20 failed attempts reach 80 but 12 reach 71 and 5 reach 50.
    # Thresholds of 60/35 would have left a fully-diluted engaged student failing 12
    # of 12 unsafely sitting below the flag line.
    "bands": {"high": 50, "medium": 28},
    # Reused BY REFERENCE from cohort_analytics, which reserved both sub-dicts for this
    # model (cohort_analytics.py:208-211). A copy would drift the moment either is tuned.
    "scales": WEIGHT_RUBRIC["scales"],
    "confidence": WEIGHT_RUBRIC["confidence"],
}

# Signals drawn from a sample, so their deficit is shrunk toward the no-evidence prior
# by n / (n + SHRINKAGE_K). The rest are profile facts and are used at face value.
_SAMPLED = frozenset({"osce_failure", "safety", "flashcard"})


def band_for(risk_score: int | None) -> str:
    """Band for a score. None (no signal at all) is `no_data`, never `low` — "we know
    nothing about this student" and "this student is fine" are different answers."""
    if risk_score is None:
        return "no_data"
    bands = RISK_RUBRIC["bands"]
    if risk_score >= bands["high"]:
        return "high"
    if risk_score >= bands["medium"]:
        return "medium"
    return "low"


def _risk_components(
    days_inactive: int | None,
    streak: int | None,
    weak_count: int,
    osce: dict | None,
    flashcard: dict | None,
) -> dict[str, dict]:
    """Present signals only, as {name: {"deficit": 0-1, "n": int, "detail": str}}.

    An absent signal is simply missing from this dict. `n` is the sample size for the
    shrinkage term and is 0 for profile facts (which are not shrunk). `streak_broken`
    additionally requires `days_inactive > 0` — not checking in today is normal for an
    otherwise-active student.
    """
    scales = RISK_RUBRIC["scales"]
    inactivity_full_days = RISK_RUBRIC["inactivity_full_days"]
    weak_breadth_full = RISK_RUBRIC["weak_breadth_full"]
    comps: dict[str, dict] = {}
    started = days_inactive is not None

    if started:
        comps["inactivity"] = {
            "deficit": _unit(days_inactive / inactivity_full_days),
            "n": 0,
            "detail": (
                "Active today" if days_inactive <= 0
                else f"No activity for {days_inactive} day{'s' if days_inactive != 1 else ''}"
            ),
        }
        # `streak is None` means the profile carries no streak column at all, which is
        # absence of evidence, not a broken streak. And `days_inactive > 0` gates it
        # further: not checking in TODAY is normal for an otherwise-active student, so
        # a broken streak counts only once the student has ALSO stopped showing up.
        if streak is not None and days_inactive > 0:
            comps["streak_broken"] = {
                "deficit": 1.0 if streak == 0 else 0.0,
                "n": 0,
                "detail": "Check-in streak is broken" if streak == 0
                          else f"Check-in streak of {streak} days",
            }
        comps["weak_breadth"] = {
            "deficit": _unit(weak_count / weak_breadth_full),
            "n": 0,
            "detail": f"{weak_count} weak topic{'s' if weak_count != 1 else ''} recorded",
        }

    o = osce or {}
    graded_n = int(o.get("graded_n") or 0)
    if o.get("pass_rate") is not None and graded_n > 0:
        pass_rate = float(o["pass_rate"])
        fails = round((1.0 - pass_rate) * graded_n)
        comps["osce_failure"] = {
            # Deliberate cross-name coupling: "osce_pass" is cohort_analytics' pass-rate
            # divisor (1.0), reused here under the weight name "osce_failure" — the same
            # rate, inverted. Pinned by test_scale_mapping_pins_the_cross_name_coupling
            # so a rename in WEIGHT_RUBRIC["scales"] fails loudly, not at call time.
            "deficit": _unit(1.0 - pass_rate / scales["osce_pass"]),
            "n": graded_n,
            "detail": f"Failed {fails} of {graded_n} graded OSCE attempt"
                      f"{'s' if graded_n != 1 else ''}",
        }
    safety_n = int(o.get("safety_gradable_n") or 0)
    if o.get("safety_fail_rate") is not None and safety_n > 0:
        rate = float(o["safety_fail_rate"])
        comps["safety"] = {
            # The one signal where higher is already worse, so it is not inverted.
            "deficit": _unit(rate / scales["safety"]),
            "n": safety_n,
            "detail": f"Safety fail on {round(rate * safety_n)} of {safety_n} "
                      f"gradable attempt{'s' if safety_n != 1 else ''}",
        }

    f = flashcard or {}
    fc_n = int(f.get("n") or 0)
    if f.get("accuracy") is not None and fc_n > 0:
        accuracy = float(f["accuracy"])
        comps["flashcard"] = {
            "deficit": _unit(1.0 - accuracy / scales["flashcard"]),
            "n": fc_n,
            "detail": f"Flashcard accuracy {round(accuracy)}% over {fc_n} answers",
        }
    return comps


def score_student(
    *,
    days_inactive: int | None,
    streak: int | None,
    weak_count: int,
    osce: dict | None,
    flashcard: dict | None,
) -> dict:
    """Score one student 0-100 (higher = more at risk) with the reasons behind it.

    Args:
        days_inactive: whole days since `last_active`, SGT. None when the profile has
            no `last_active` — the "has not started" signal, not a zero.
        streak: current check-in streak, or None when unknown.
        weak_count: `len(profile["weak_topics"])`.
        osce: per-student OSCE block from `cohort_analytics.osce_by_student`, or None.
            Reads `pass_rate`/`graded_n` and `safety_fail_rate`/`safety_gradable_n`,
            each with its own denominator — over half of production case_progress rows
            are unscored, so one shared denominator would mis-state both.
        flashcard: per-student block from `cohort_analytics.flashcard_by_student`
            ({accuracy 0-100, n}), or None.

    Returns `{"risk_score": int | None, "band": str, "reasons": [...]}`. `reasons`
    holds only signals that actually contributed (a zero-deficit signal like "streak of
    9 days" is not a reason a student is at risk) sorted by contribution descending;
    each `weight` is that signal's share of the final score and sums to `risk_score`
    within rounding, because a trainer reads them as "this is where the number came
    from" — raw rubric weights would not add up to what is on screen.
    """
    comps = _risk_components(days_inactive, streak, weak_count, osce, flashcard)
    if not comps:
        return {
            "risk_score": None,
            "band": "no_data",
            "reasons": [{"factor": "never_started", "weight": 0.0,
                         "detail": "No activity and no attempts recorded yet"}],
        }

    weights = RISK_RUBRIC["weights"]
    total_w = sum(weights[name] for name in comps)
    reasons: list[dict] = []
    score = 0.0
    for name, c in comps.items():
        shrink = c["n"] / (c["n"] + SHRINKAGE_K) if name in _SAMPLED else 1.0
        contribution = (weights[name] / total_w) * c["deficit"] * shrink
        score += contribution
        # Zero-deficit signals (e.g. a 9-day streak, 0 weak topics) are present for the
        # renormalised denominator but are not a REASON — a trainer should not read
        # "0 weak topics recorded" as evidence this student is at risk.
        if contribution > 0:
            reasons.append({
                "factor": name,
                "weight": round(contribution * 100, 1),
                "detail": c["detail"],
            })

    # Fully ordered: biggest contributor first, then factor name. Dict insertion order
    # must not leak into a list a trainer acts on.
    reasons.sort(key=lambda r: (-r["weight"], r["factor"]))
    # round() without ndigits on a float already returns int in Python 3.
    risk_score = round(score * 100)
    return {"risk_score": risk_score, "band": band_for(risk_score), "reasons": reasons}
