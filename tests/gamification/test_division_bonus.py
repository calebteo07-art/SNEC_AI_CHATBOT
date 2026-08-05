"""The division multiplier — what a tier is FOR.

Before this, a division was a bracket and a badge: it decided who you were ranked against
and nothing else. Every Lumen earned anywhere in the app now scales with it.

The rules that matter, and each has a test below because each is a way to get it wrong:
  · Only EARNINGS scale. A forfeit penalty passed through the same multiplier would punish
    a Prism student 2x for the same mistake, which is the exact opposite of a reward.
  · The ladder is monotonic and starts at 1.0, so Ember is never taxed for being new.
  · Rounding is half-UP and deterministic. Python's round() is banker's rounding
    (round(4.5) == 4, round(5.5) == 6), and a game economy that rounds a 5-Lumen chat
    reward differently depending on whether the total is odd is indefensible to a student.
"""
import pytest

from tools.gamification.league import (
    DIVISION_MULTIPLIERS,
    TOP_DIVISION,
    apply_division_bonus,
    division_multiplier,
)


def test_the_ladder_covers_every_division_and_starts_at_one():
    assert len(DIVISION_MULTIPLIERS) == TOP_DIVISION
    assert DIVISION_MULTIPLIERS[0] == 1.0


def test_the_ladder_only_ever_climbs():
    # A tier that pays less than the one below it would make promotion a punishment.
    assert all(b > a for a, b in zip(DIVISION_MULTIPLIERS, DIVISION_MULTIPLIERS[1:]))


@pytest.mark.parametrize("division,expected", list(enumerate(DIVISION_MULTIPLIERS, start=1)))
def test_each_division_reports_its_own_multiplier(division, expected):
    assert division_multiplier(division) == expected


@pytest.mark.parametrize("bad", [None, 0, -3, 99, "gold", "", object()])
def test_a_bad_division_never_raises_and_never_pays_more_than_the_top(bad):
    """Same clamp contract as division_name: a null column pre-migration, or a value from
    a future migration, must never 500 an XP write or silently mint Lumens."""
    m = division_multiplier(bad)
    assert 1.0 <= m <= DIVISION_MULTIPLIERS[-1]


def test_earnings_scale_with_the_division():
    assert apply_division_bonus(100, 1) == 100
    assert apply_division_bonus(100, TOP_DIVISION) == int(100 * DIVISION_MULTIPLIERS[-1])


def test_a_penalty_is_never_multiplied():
    # The forfeit is -30 flat at every tier. Scaling it would mean the better you do,
    # the more a single forfeit costs you.
    for d in range(1, TOP_DIVISION + 1):
        assert apply_division_bonus(-30, d) == -30


def test_zero_stays_zero():
    for d in range(1, TOP_DIVISION + 1):
        assert apply_division_bonus(0, d) == 0


def test_rounding_is_half_up_not_bankers():
    """5 Lumens (the tutor-chat award) at 1.1x is 5.5. Half-up gives 6 every time;
    Python's round() would give 6 here and 4 for 4.5, which is not explainable."""
    assert apply_division_bonus(5, 2) == 6      # 5 * 1.1 = 5.5 -> 6
    assert apply_division_bonus(3, 4) == 5      # 3 * 1.5 = 4.5 -> 5


def test_the_result_is_a_plain_int():
    # It lands in an integer XP column and is summed into weekly tallies.
    got = apply_division_bonus(7, 3)
    assert isinstance(got, int) and not isinstance(got, bool)


def test_no_tier_can_lose_Lumens_by_earning():
    """A multiplier below 1.0 anywhere, or a rounding mode that floors, would make a
    1-Lumen award worth 0 at some tier — the smallest award in the app must survive."""
    for d in range(1, TOP_DIVISION + 1):
        assert apply_division_bonus(1, d) >= 1
