"""League rules — pure, deterministic. No I/O, no DB, no clock."""
import pytest

from tools.gamification.league import (
    DIVISIONS, TOP_DIVISION, division_name, promote_count,
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


from tools.gamification.league import close_week


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
