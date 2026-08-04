"""The boost composes with the division multiplier at ONE site, and rounds ONCE.

The rule this shares with the division bonus is the important one: penalties never scale.
tests/gamification/test_division_bonus.py pins that for the division multiplier; this pins
it for the boost, because the two now stack and a rule enforced in only one of them is a
rule that is not enforced.
"""
from tools.gamification.league import apply_division_bonus


def test_no_boost_is_the_existing_behaviour():
    # Default must be inert, or every existing caller silently changes payout.
    assert apply_division_bonus(10, 1) == apply_division_bonus(10, 1, 1.0)


def test_a_boost_doubles_an_earning():
    assert apply_division_bonus(10, 1, 2.0) == 20


def test_a_boost_composes_with_the_division_multiplier():
    # Gold is 1.25x. 10 earns 12.5 raw, which the half-up rule rounds to 13.
    # With a 2x boost the raw value is 25.0 exactly, so the answer is 25 — NOT
    # 2 * 13. That gap IS the double-rounding this function exists to avoid: the
    # boost multiplies the raw earning, never the already-rounded one.
    assert apply_division_bonus(10, 3) == 13
    assert apply_division_bonus(10, 3, 2.0) == 25


def test_a_boost_never_scales_a_penalty():
    # A forfeit is -30 flat at every division under every boost. Scaling it would mean the
    # better you are doing, the more one mistake costs you.
    assert apply_division_bonus(-30, 5, 2.0) == -30


def test_a_boost_never_scales_zero():
    assert apply_division_bonus(0, 5, 2.0) == 0


def test_rounding_happens_once_not_twice():
    # 7 at a 1.25x division with a 1.5x boost: one rounding is floor(7*1.875+0.5)=13.
    # Rounding twice would give floor(floor(7*1.25+0.5)*1.5+0.5) = floor(9*1.5+0.5) = 14.
    from tools.gamification.league import division_multiplier
    div = next((d for d in range(1, 8) if division_multiplier(d) == 1.25), None)
    if div is None:
        import pytest
        pytest.skip("no 1.25x division on the current ladder")
    assert apply_division_bonus(7, div, 1.5) == 13
