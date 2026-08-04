"""The division multiplier, where it actually lands.

`tools/profile/update_profile.py` is the ONE place any Lumen is credited in this app —
OSCE grading, flashcard decks, tutor chat and the daily check-in all funnel through it —
so the multiplier is applied there once rather than at each award site. These tests pin
that single application, because the failure mode of getting it wrong is silent: XP still
lands, just at the wrong rate, and no screen says so.

Every tally has its own assertion. `xp`, `xp_today`, `xp_week` and `coins_earned` are four
separate writes computed from the same gain, and scaling three of them is a bug nobody
would notice until a student's weekly rank disagreed with their level.
"""
import pytest

from tools.gamification.league import DIVISION_MULTIPLIERS

GOLD = 3          # 1.25x
DIAMOND = 5       # 2.0x


def _mod():
    from tools.profile import update_profile as mod
    return mod


async def _run(monkeypatch, profile, **kwargs):
    mod = _mod()
    writes = []

    async def _get(_sid):
        return profile

    async def _upd(_sid, **k):
        writes.append(k)

    monkeypatch.setattr(mod, "get_profile", _get)
    monkeypatch.setattr(mod.db, "update_profile", _upd)
    await mod.update_profile("s1", **kwargs)
    return writes


def _field(writes, key):
    for w in writes:
        if key in w:
            return w[key]
    return None


@pytest.mark.asyncio
async def test_a_gold_student_earns_a_quarter_more(monkeypatch):
    writes = await _run(monkeypatch, {"xp": 0, "coins_earned": 0, "hearts": 5, "division": GOLD},
                        xp_delta=100)
    assert _field(writes, "xp") == 125


@pytest.mark.asyncio
async def test_every_tally_scales_together(monkeypatch):
    """xp / xp_today / xp_week / coins_earned are four separate writes off one gain.
    If they disagree, a student's rank and their level tell different stories."""
    writes = await _run(monkeypatch, {"xp": 0, "coins_earned": 0, "hearts": 5, "division": DIAMOND},
                        xp_delta=40)
    assert _field(writes, "xp") == 80
    assert _field(writes, "xp_today") == 80
    assert _field(writes, "xp_week") == 80
    assert _field(writes, "coins_earned") == 80


@pytest.mark.asyncio
async def test_a_forfeit_costs_the_same_at_every_tier(monkeypatch):
    """The forfeit penalty is -30 flat. A Diamond student must not pay -60 for the same
    mistake — that would make the reward for climbing a punishment for slipping."""
    for div in (1, GOLD, DIAMOND):
        writes = await _run(monkeypatch,
                            {"xp": 500, "coins_earned": 500, "hearts": 5, "division": div},
                            xp_delta=-30)
        assert _field(writes, "xp") == 470, f"division {div}"
        # ...and lifetime Lumens stay monotonic, untouched by a penalty at any tier.
        assert all("coins_earned" not in w for w in writes), f"division {div}"


@pytest.mark.asyncio
async def test_a_profile_with_no_division_earns_exactly_what_it_used_to(monkeypatch):
    """Migration 016 defaults `division` to 1, but a row written before it lands has no
    column at all. Pre-migration rows must keep earning 1.0x rather than 500-ing the write
    or quietly minting Lumens."""
    writes = await _run(monkeypatch, {"xp": 0, "coins_earned": 0, "hearts": 5}, xp_delta=100)
    assert _field(writes, "xp") == 100


@pytest.mark.asyncio
async def test_the_streak_bonus_scales_too(monkeypatch):
    """The check-in bonus is an earning like any other. It is computed inside
    update_profile rather than passed in, so it is the one award that could silently
    escape the multiplier."""
    mod = _mod()
    writes = await _run(monkeypatch,
                        {"xp": 0, "coins_earned": 0, "hearts": 5, "division": DIAMOND,
                         "checkin_history": [], "streak": 0},
                        xp_delta=0, checkin_done=True)
    assert _field(writes, "xp") == mod.CHECKIN_BONUS * 2


@pytest.mark.asyncio
async def test_the_top_tier_pays_the_top_of_the_ladder(monkeypatch):
    """Pinned against the ladder itself, so retuning DIVISION_MULTIPLIERS cannot leave
    this test asserting a number the economy no longer uses."""
    writes = await _run(monkeypatch,
                        {"xp": 0, "coins_earned": 0, "hearts": 5, "division": DIAMOND},
                        xp_delta=200)
    assert _field(writes, "xp") == int(200 * DIVISION_MULTIPLIERS[-1])
