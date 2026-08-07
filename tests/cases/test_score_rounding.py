"""The 100 a student is shown must be the 100 the formula computed, and its parts must add up.

Each of the three buckets was rounded independently and the roundings then summed, so up to
three half-point errors could stack. Measured exhaustively over the 150,381 reachable
(steps_done, steps_total, domain-score, has_manual, safe) combinations: 81 students were
under-marked ACROSS THE 60-POINT PASS LINE (0.054%) and 1,340 were over-marked (0.89%).

The tie-break was never the defect, and switching to half-up is not the fix — it raises
false passes to 2,704. Rounding once, on the total, is.

The buckets are also displayed and persisted individually (score_100, checklist_coverage,
consult_technique, judgement_safety, and the frontend's scoreBuckets), so they cannot simply
become floats: they must stay whole numbers that ADD UP to the displayed total. Largest-
remainder apportionment gives both.
"""
from fractions import Fraction

import pytest

from tools.cases.station_score import (
    CHECKLIST_MAX, SAFETY_CAP, SCHEME_MAX, compute_station_score,
)


def _steps(total: int, critical_at: int | None = None) -> list[dict]:
    return [{"step_number": i + 1, "action": f"step {i + 1}",
             "critical": (critical_at is not None and i == critical_at)}
            for i in range(total)]


def _score(done: int, total: int, domains: dict, has_manual: bool, critical_at=None):
    steps = _steps(total, critical_at)
    performed = list(range(1, done + 1))
    return compute_station_score(domains, steps, performed, has_manual)


def _exact_total(done, total, d, has_manual, safe) -> Fraction:
    cov = Fraction(CHECKLIST_MAX * done, total) if total else Fraction(CHECKLIST_MAX)
    consult = (Fraction(SCHEME_MAX * (d["history"] + d["investigations"]), 20) if has_manual
               else Fraction(SCHEME_MAX * d["history"], 10))
    judge = Fraction(SCHEME_MAX * (d["diagnosis"] + d["management"]), 20)
    if not safe:
        judge *= Fraction(SAFETY_CAP).limit_denominator(100)
    return cov + consult + judge


ALL = [(h, i, dg, m) for h in (0, 3, 5, 7, 10) for i in (0, 3, 5, 7, 10)
       for dg in (0, 5, 7, 10) for m in (0, 5, 7, 10)]


@pytest.mark.parametrize("total", [3, 7, 12, 20, 29])
def test_the_parts_always_sum_to_the_total(total):
    """Non-negotiable: the three numbers on the debrief must add to the big one."""
    for done in range(total + 1):
        for h, i, dg, m in ALL[::7]:
            for has_manual in (True, False):
                s = _score(done, total,
                           {"history": h, "investigations": i, "diagnosis": dg, "management": m},
                           has_manual)
                assert (s["checklist_coverage"] + s["consult_technique"]
                        + s["judgement_safety"]) == s["score_100"], s


@pytest.mark.parametrize("total", [3, 7, 12, 20, 29])
def test_the_total_is_the_exact_total_rounded_once(total):
    """The reported score never differs from the exact arithmetic by more than one round."""
    for done in range(total + 1):
        for h, i, dg, m in ALL[::5]:
            for has_manual in (True, False):
                d = {"history": h, "investigations": i, "diagnosis": dg, "management": m}
                s = _score(done, total, d, has_manual)
                want = round(_exact_total(done, total, d, has_manual, safe=True))
                assert abs(s["score_100"] - want) <= 0, (
                    f"done={done}/{total} {d} manual={has_manual}: "
                    f"got {s['score_100']}, exact rounds to {want}")


@pytest.mark.parametrize("total", [7, 12, 20])
def test_no_bucket_ever_exceeds_its_maximum(total):
    for done in range(total + 1):
        for h, i, dg, m in ALL[::11]:
            for has_manual in (True, False):
                s = _score(done, total,
                           {"history": h, "investigations": i, "diagnosis": dg, "management": m},
                           has_manual)
                assert 0 <= s["checklist_coverage"] <= CHECKLIST_MAX
                assert 0 <= s["consult_technique"] <= SCHEME_MAX
                assert 0 <= s["judgement_safety"] <= SCHEME_MAX
                assert 0 <= s["score_100"] <= 100


def test_the_specific_case_that_used_to_lose_a_mark_at_the_pass_line():
    """3 steps of 7 and middling domains: three .5s used to round down independently."""
    d = {"history": 7, "investigations": 7, "diagnosis": 7, "management": 7}
    s = _score(3, 7, d, has_manual=True)
    assert s["score_100"] == round(_exact_total(3, 7, d, True, safe=True))
    assert s["checklist_coverage"] + s["consult_technique"] + s["judgement_safety"] == s["score_100"]


def test_a_perfect_station_is_still_exactly_100():
    s = _score(10, 10, {"history": 10, "investigations": 10, "diagnosis": 10, "management": 10},
               has_manual=True)
    assert s["score_100"] == 100
    assert (s["checklist_coverage"], s["consult_technique"], s["judgement_safety"]) == (
        CHECKLIST_MAX, SCHEME_MAX, SCHEME_MAX)


def test_an_empty_station_is_still_exactly_zero():
    s = _score(0, 10, {"history": 0, "investigations": 0, "diagnosis": 0, "management": 0},
               has_manual=True)
    assert s["score_100"] == 0
    assert (s["checklist_coverage"], s["consult_technique"], s["judgement_safety"]) == (0, 0, 0)


def test_the_safety_cap_still_bites():
    d = {"history": 10, "investigations": 10, "diagnosis": 10, "management": 10}
    unsafe = _score(1, 3, d, has_manual=True, critical_at=2)   # the critical step is unticked
    safe = _score(3, 3, d, has_manual=True, critical_at=2)
    assert unsafe["safe"] is False and safe["safe"] is True
    assert unsafe["judgement_safety"] < safe["judgement_safety"]
