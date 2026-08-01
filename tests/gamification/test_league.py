"""League rules — pure, deterministic. No I/O, no DB, no clock."""
from datetime import date

import pytest

from tools.gamification.league import (
    DIVISIONS, POOL_MAX, TOP_DIVISION, close_week, division_name,
    promote_count, rank_delta, split_pools,
)


def test_five_divisions_bronze_to_diamond():
    assert [name for _, name in DIVISIONS] == [
        "Bronze", "Silver", "Gold", "Platinum", "Diamond"]
    assert TOP_DIVISION == 5


def test_division_name_clamps_out_of_range():
    assert division_name(1) == "Bronze"
    assert division_name(5) == "Diamond"
    assert division_name(0) == "Bronze"     # never crash on bad data
    assert division_name(99) == "Diamond"
    assert division_name(None) == "Bronze"  # pre-migration: column absent


@pytest.mark.parametrize("pool,expected", [
    (0, 0), (1, 0),      # no race at all
    (2, 1), (3, 1),      # tiny pool: only the winner goes up
    (4, 3), (6, 3), (12, 3),
    (20, 5), (28, 7), (30, 7),
])
def test_promote_count(pool, expected):
    assert promote_count(pool) == expected


def test_promote_count_always_leaves_someone_behind():
    """If everyone promotes the line means nothing — the whole mechanic dies."""
    for pool in range(2, 41):
        assert promote_count(pool) < pool


def _standings(*pairs):
    """Ranked rows as close_week takes them: already ordered, hidden already dropped."""
    return [{"student_id": sid, "xp_final": xp} for sid, xp in pairs]


def test_close_week_promotes_the_top_slice():
    rows = close_week(_standings(("a", 900), ("b", 800), ("c", 700), ("d", 600),
                                 ("e", 500), ("f", 400)), division=2)
    assert [r["rank_final"] for r in rows] == [1, 2, 3, 4, 5, 6]
    assert [r["outcome"] for r in rows] == [
        "promoted", "promoted", "promoted", "held", "held", "held"]
    assert [r["next_division"] for r in rows] == [3, 3, 3, 2, 2, 2]
    assert rows[0]["division"] == 2      # the division they played in, not the new one
    assert rows[0]["xp_final"] == 900


def test_close_week_top_division_places_instead_of_promoting():
    rows = close_week(_standings(("a", 900), ("b", 800), ("c", 700), ("d", 600)),
                      division=5)
    assert [r["outcome"] for r in rows] == ["placed", "placed", "placed", "held"]
    assert all(r["next_division"] == 5 for r in rows)  # nobody leaves Diamond


def test_close_week_empty_pool_is_no_rows_not_a_crash():
    assert close_week([], division=1) == []


def test_close_week_missing_xp_reads_zero():
    rows = close_week([{"student_id": "a"}], division=1)
    assert rows[0]["xp_final"] == 0


WEEK = date(2026, 8, 3)  # a Monday


def test_small_division_is_one_pool():
    ids = [f"u{i}" for i in range(12)]
    assert split_pools(ids, WEEK) == [sorted(ids)]


def test_large_division_splits_into_balanced_pools_under_the_cap():
    ids = [f"u{i:03d}" for i in range(71)]
    pools = split_pools(ids, WEEK)
    assert len(pools) == 3
    assert all(len(p) <= POOL_MAX for p in pools)
    assert sorted(x for p in pools for x in p) == sorted(ids)   # nobody lost or duplicated
    assert max(len(p) for p in pools) - min(len(p) for p in pools) <= 1


def test_pool_membership_is_stable_within_a_week():
    ids = [f"u{i:03d}" for i in range(71)]
    assert split_pools(ids, WEEK) == split_pools(ids, WEEK)


def test_pool_membership_reshuffles_across_weeks():
    ids = [f"u{i:03d}" for i in range(71)]
    assert split_pools(ids, WEEK) != split_pools(ids, date(2026, 8, 10))


def test_rank_delta_is_positive_when_climbing():
    assert rank_delta(live_rank=4, rank_prev=7) == 3     # 7th -> 4th = climbed 3
    assert rank_delta(live_rank=9, rank_prev=6) == -3
    assert rank_delta(live_rank=4, rank_prev=4) == 0


def test_rank_delta_is_none_without_a_prior_snapshot():
    """New this week, or pre-migration — the UI must show a dash, not a fake zero."""
    assert rank_delta(live_rank=4, rank_prev=None) is None
    assert rank_delta(live_rank=None, rank_prev=4) is None
