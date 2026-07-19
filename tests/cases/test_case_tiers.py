# tests/cases/test_case_tiers.py
"""Guards the OSCE case tiering (clinical-complexity & risk rebalance, 2026-07-19).

Cases are split into three tiers stored under `difficulty`:
    beginner     -> Foundational
    intermediate -> Developing
    advanced     -> Advanced

Before the rebalance the library was badly skewed (38 / 114 / 3), so 74% of cases sat
in the middle and each role had exactly ONE advanced case. These tests lock in that the
split stays a real three-tier ladder AND that the difficulty-unlock gate in
`tools/api/routers/cases.py` stays satisfiable *per role* (a student only sees their own
role's cases): intermediate needs >=2 passing beginner, advanced needs >=2 passing
intermediate. If a future edit collapses the tiers again, these fail.
"""
import collections

import pytest

from tools.cases.load_case import list_available_cases, load_case

VALID = {"beginner", "intermediate", "advanced"}

# Per-role floors. Comfortably met by the 2026-07-19 distribution
# (OA 15/26/10, OT 15/29/10, PSA 17/22/11) and chosen to FAIL the old skew
# (advanced was 1 per role) or any future re-collapse into a single tier.
MIN_FOUNDATIONAL = 5   # beginner
MIN_DEVELOPING = 5     # intermediate
MIN_ADVANCED = 3       # advanced


def _counts_by_role():
    """(role -> {difficulty: count}) over every case file, plus the raw cases."""
    by_role = collections.defaultdict(collections.Counter)
    cases = []
    for cid in list_available_cases():
        c = load_case(cid)
        cases.append(c)
        role = (c.get("role") or "any").upper()
        by_role[role][c.get("difficulty")] += 1
    return by_role, cases


def test_every_case_has_a_valid_tier():
    _, cases = _counts_by_role()
    bad = [(c["case_id"], c.get("difficulty")) for c in cases if c.get("difficulty") not in VALID]
    assert not bad, f"cases with an invalid/missing difficulty: {bad}"


@pytest.mark.parametrize("role", ["OA", "OT", "PSA"])
def test_role_ladder_is_populated_and_gate_satisfiable(role):
    by_role, _ = _counts_by_role()
    counts = by_role[role]
    f, d, a = counts["beginner"], counts["intermediate"], counts["advanced"]

    # No empty tier for the role.
    assert f and d and a, f"{role} has an empty tier: Foundational={f} Developing={d} Advanced={a}"

    # Gate must stay satisfiable: a student can reach every tier by clearing the one below.
    assert f >= 2, f"{role} needs >=2 Foundational to unlock Developing (has {f})"
    assert d >= 2, f"{role} needs >=2 Developing to unlock Advanced (has {d})"

    # Real three-tier ladder — not a single-tier dumping ground.
    assert f >= MIN_FOUNDATIONAL, f"{role} Foundational too thin: {f} < {MIN_FOUNDATIONAL}"
    assert d >= MIN_DEVELOPING, f"{role} Developing too thin: {d} < {MIN_DEVELOPING}"
    assert a >= MIN_ADVANCED, f"{role} Advanced too thin: {a} < {MIN_ADVANCED} (skew regression?)"


def test_no_single_tier_dominates_a_role():
    """The middle tier was a 74% dumping ground pre-rebalance. Keep any one tier under
    70% of a role's cases so the ladder stays meaningful."""
    by_role, _ = _counts_by_role()
    for role, counts in by_role.items():
        total = sum(counts.values())
        if total < 10:  # tiny/synthetic role sets are not meaningfully skewed
            continue
        worst_tier, worst = counts.most_common(1)[0]
        assert worst / total <= 0.70, (
            f"{role}: '{worst_tier}' holds {worst}/{total} ({worst/total:.0%}) of cases — "
            "tiers are collapsing back into one bucket"
        )
