"""The daily chest and the boost clock.

The drop is a pure function of (student_id, date). It still FEELS variable — it changes
every day and cannot be predicted — but it cannot be re-rolled, which is what makes the
idempotent claim correct by construction instead of by luck: even if the claim write
fails and the student clicks again, the prize is arithmetically the same one.

The boost is an EXPIRY, not a banked charge. Consuming it writes nothing, so two
concurrent submits cannot race over the same charge.
"""
from datetime import date, datetime, timedelta, timezone

from tools.gamification.chest import DROPS, boost_multiplier, roll_chest

TODAY = date(2026, 8, 4)
SGT = timezone(timedelta(hours=8))


def test_the_drop_is_deterministic_for_one_student_and_day():
    assert roll_chest("ann", TODAY) == roll_chest("ann", TODAY)


def test_the_drop_varies_across_days():
    drops = {roll_chest("ann", TODAY + timedelta(days=i)).key for i in range(60)}
    assert len(drops) > 1


def test_every_drop_kind_is_reachable_over_a_year():
    seen = {roll_chest("ann", TODAY + timedelta(days=i)).key for i in range(365)}
    assert seen == {d.key for d in DROPS}


def test_a_drop_is_always_one_of_the_declared_kinds():
    for i in range(120):
        assert roll_chest(f"s{i}", TODAY).key in {d.key for d in DROPS}


def test_no_boost_when_nothing_is_stored():
    assert boost_multiplier({}, datetime(2026, 8, 4, 12, tzinfo=SGT)) == 1.0


def test_the_boost_applies_before_its_expiry():
    profile = {"boosts": {"xp2x_until": datetime(2026, 8, 4, 13, tzinfo=SGT).isoformat()}}
    assert boost_multiplier(profile, datetime(2026, 8, 4, 12, 59, tzinfo=SGT)) == 2.0


def test_the_boost_is_gone_after_its_expiry():
    profile = {"boosts": {"xp2x_until": datetime(2026, 8, 4, 13, tzinfo=SGT).isoformat()}}
    assert boost_multiplier(profile, datetime(2026, 8, 4, 13, 1, tzinfo=SGT)) == 1.0


def test_the_boost_is_gone_exactly_at_its_expiry():
    # The boundary is the one a countdown UI lands on, so pin it rather than leave it to
    # whichever comparison the implementation happened to pick.
    at = datetime(2026, 8, 4, 13, tzinfo=SGT)
    profile = {"boosts": {"xp2x_until": at.isoformat()}}
    assert boost_multiplier(profile, at) == 1.0


def test_a_corrupt_boost_stamp_is_not_a_boost_and_does_not_raise():
    assert boost_multiplier({"boosts": {"xp2x_until": "not-a-date"}}, datetime.now(SGT)) == 1.0
    assert boost_multiplier({"boosts": "not-a-dict"}, datetime.now(SGT)) == 1.0
