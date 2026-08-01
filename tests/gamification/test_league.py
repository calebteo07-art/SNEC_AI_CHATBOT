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
