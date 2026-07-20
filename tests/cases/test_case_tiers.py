# tests/cases/test_case_tiers.py
"""Guards the OSCE case tiering (clinical-complexity & risk rebalance, 2026-07-19).

Cases are split into three tiers stored under `difficulty`:
    beginner     -> Foundational
    intermediate -> Developing
    advanced     -> Advanced

Before the rebalance the library was badly skewed (38 / 114 / 3), so 74% of cases sat
in the middle and each role had exactly ONE advanced case. These tests lock in that the
split stays a real three-tier ladder AND that the per-topic difficulty-unlock gate
(`tools/cases/tier_gate.py`) leaves every case reachable — no dead-end topics. If a future
edit collapses the tiers or strands a topic, these fail.
"""
import collections

import pytest

from tools.cases.load_case import list_available_cases, load_case
from tools.cases.topic_sets import resolve_set, case_visible
from tools.cases.tier_gate import build_census, evaluate

VALID = {"beginner", "intermediate", "advanced"}

# Student pools (OA and PSA share the CLINICAL pool; OT is separate) and a representative
# role per pool, used to reproduce GET /api/cases' visibility + topic-set bucketing.
POOL_ROLE = {"CLINICAL": "OA", "OT": "OT"}

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

    # Healthy ladder floors (per-topic reachability itself is proven by the fixpoint test
    # below; these keep each role's Foundational/Developing bands from thinning out).
    assert f >= 2, f"{role} Foundational too thin: {f}"
    assert d >= 2, f"{role} Developing too thin: {d}"

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


def _pool_cases():
    """pool -> list of (case_id, set_key, difficulty), bucketed exactly like GET /api/cases
    (explicit `topic_set` field else resolve_set) over the cases visible to that pool."""
    _, cases = _counts_by_role()
    out = {p: [] for p in POOL_ROLE}
    for pool, role in POOL_ROLE.items():
        for c in cases:
            if not case_visible(role, c.get("role") or "any"):
                continue
            sk = c.get("topic_set") or resolve_set(role, c.get("topic", ""))
            out[pool].append((c["case_id"], sk, (c.get("difficulty") or "").lower()))
    return out


def test_every_case_is_reachable_under_the_pertopic_gate():
    """No dead-end topics. Some topic-sets legitimately have NO Foundational case — by the
    risk rubric an 'Ocular Emergency' or sight-threatening 'Triage & Referral' patient
    (OA/PSA), or an HVF / corneal-topography / anterior-segment / PAM station (OT), is never
    routine — and some topics carry only a single prerequisite case. The per-topic gate
    (tools/cases/tier_gate.py) keeps them ALL reachable: min(2, available) completions in
    the same topic, or any 3 completions in any topic when the tier below is absent.

    This proves it by simulating the unlock cascade over the REAL library with the SAME gate
    the app uses: start with nothing done, greedily "complete" whatever is currently
    unlocked, and repeat to a fixpoint. Every case must eventually become reachable. A future
    data edit that strands a tier (e.g. an all-Advanced topic, or deleting a pool's last
    Foundational cases) makes some case never unlock and fails here."""
    by_pool = _pool_cases()
    assert set(by_pool) == set(POOL_ROLE)
    for pool, cases in by_pool.items():
        assert len(cases) >= 30, f"{pool}: only {len(cases)} cases bucketed — resolve_set broke?"
        completed: set[str] = set()
        changed = True
        while changed:
            changed = False
            census = build_census((sk, diff, cid in completed) for cid, sk, diff in cases)
            for cid, sk, diff in cases:
                if cid in completed:
                    continue
                locked, _ = evaluate(diff, sk, census)
                if not locked:
                    completed.add(cid)
                    changed = True
        unreachable = sorted(cid for cid, _, _ in cases if cid not in completed)
        assert not unreachable, f"{pool}: cases never unlockable under the per-topic gate: {unreachable}"
