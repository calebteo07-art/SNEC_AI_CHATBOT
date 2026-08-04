"""League rules — pure and deterministic (the `leaderboard.py` convention: no I/O here).

The board is a promotion-only weekly ladder. A student sits in a division; each SGT week
the top slice of their division moves up on Monday and nobody is ever demoted. Every rule
that decides *who* moves lives in this module so it can be tested without a database.
"""
import hashlib
import math
from datetime import date

# (level, display name). Reuses the colours/names students already see on the board, so the
# rename from "lifetime XP tier" to "earned division" needs no new art or vocabulary.
DIVISIONS: list[tuple[int, str]] = [
    (1, "Bronze"), (2, "Silver"), (3, "Gold"), (4, "Platinum"), (5, "Diamond"),
]
TOP_DIVISION = 5
POOL_MAX = 30  # Duolingo's pool size; above this a division splits into balanced pools

# What a division is FOR. Until this existed a tier decided who you were ranked against and
# nothing else — a bracket and a badge. Every Lumen earned anywhere in the app (OSCE,
# flashcards, tutor chat, the daily check-in and its streak bonus) now scales with it.
#
# Why this is safe to multiply, and where it would not have been:
#   · A student is only ever ranked against their OWN division, and everyone in a division
#     shares its multiplier — so the weekly race is untouched. It rewards the tier you have
#     already reached; it cannot help you reach the next one.
#   · Promotion is by RANK, never by score, so no amount of multiplier buys a promotion.
#   · The staff console does not compare raw XP between students, so a multiplied Lumen
#     never distorts a supervisor's read of who practised more. Check that again before
#     any analytics work starts ranking on `xp`.
# Indexed by division - 1. Loud on purpose: Diamond doubling is the point of Diamond, and
# a ladder a student cannot recite is not a goal they can chase.
DIVISION_MULTIPLIERS: list[float] = [1.0, 1.1, 1.25, 1.5, 2.0]


def _clamp_division(division) -> int:
    """Every public helper here takes whatever the DB hands it. A null column
    (pre-migration) or a value from a future migration must never raise: this sits on the
    XP write path, and an exception here would cost a student the Lumens they just earned."""
    try:
        d = int(division)
    except (TypeError, ValueError):
        d = 1
    return max(1, min(TOP_DIVISION, d))


def division_name(division) -> str:
    """Display name for a division level. Clamps rather than raising: a null column
    (pre-migration) or a bad value must never 500 the board."""
    return DIVISIONS[_clamp_division(division) - 1][1]


def division_multiplier(division) -> float:
    """The Lumens multiplier this division earns. 1.0 at Bronze — the bottom rung is never
    taxed for being new."""
    return DIVISION_MULTIPLIERS[_clamp_division(division) - 1]


def apply_division_bonus(amount: int, division) -> int:
    """Scale one EARNING by the earner's division. Pure, so the economy can be reasoned
    about without a database.

    Penalties pass through untouched. A forfeit is -30 flat at every tier: running it
    through the same multiplier would mean the better you do, the more one mistake costs
    you, which is the exact opposite of a reward.

    Rounds half-UP rather than using round(), which is banker's rounding — round(4.5) is 4
    and round(5.5) is 6 — so a 5-Lumen chat award would round differently from a 3-Lumen
    one for reasons no student could be told."""
    a = int(amount)
    if a <= 0:
        return a
    return math.floor(a * division_multiplier(division) + 0.5)


def promote_count(pool_size: int) -> int:
    """How many of a pool of `pool_size` move up on Monday.

    ~25% (Duolingo promotes 7 of 30), floored at 3 and capped at 7 so the rule reads the
    same to a cohort of 12 and a cohort of 30. Two guards matter: a pool of 1 has no race,
    and the count is always strictly less than the pool — if everyone promotes, the
    promotion line stops meaning anything, which is the entire mechanic."""
    n = int(pool_size or 0)
    if n <= 1:
        return 0
    if n < 4:
        return 1
    return min(n - 1, max(3, min(7, math.ceil(n * 0.25))))


def close_week(standings: list[dict], division: int) -> list[dict]:
    """Turn one division's final standings into outcome rows.

    `standings` is already ranked and already excludes hidden students — a hidden student
    must not occupy a promotion slot invisibly, and that filtering belongs to the caller
    that knows about visibility. Returns one row per student, ready to persist."""
    n = len(standings)
    at_top = int(division or 1) >= TOP_DIVISION
    promo = 0 if at_top else promote_count(n)

    rows: list[dict] = []
    for i, s in enumerate(standings):
        rank = i + 1
        if at_top:
            outcome, nxt = ("placed" if rank <= 3 else "held"), TOP_DIVISION
        elif rank <= promo:
            outcome, nxt = "promoted", int(division) + 1
        else:
            outcome, nxt = "held", int(division)
        rows.append({
            "student_id": s.get("student_id"),
            "division": int(division or 1),
            "xp_final": int(s.get("xp_final") or 0),
            "rank_final": rank,
            "outcome": outcome,
            "next_division": nxt,
        })
    return rows


def split_pools(student_ids: list[str], week_start: date) -> list[list[str]]:
    """Split one division into balanced pools of at most POOL_MAX.

    Sorting by a hash of (id, week) rather than bucketing by hash-modulo keeps the pools
    balanced *and* deterministic: the same inputs always give the same pools, so membership
    can't churn mid-week, but it reshuffles every Monday so students meet new rivals.
    Inert below the cap — most cohorts will only ever see one pool."""
    ids = sorted(student_ids)
    if len(ids) <= POOL_MAX:
        return [ids]
    n_pools = math.ceil(len(ids) / POOL_MAX)
    stamp = week_start.isoformat()
    keyed = sorted(ids, key=lambda sid: hashlib.sha1(f"{sid}|{stamp}".encode()).hexdigest())
    size = math.ceil(len(keyed) / n_pools)
    return [keyed[i:i + size] for i in range(0, len(keyed), size)]


def rank_delta(live_rank, rank_prev):
    """Places gained since the last daily snapshot — positive means climbed.
    None when there is no prior snapshot, so the UI can show a dash instead of a
    misleading "no change"."""
    if live_rank is None or rank_prev is None:
        return None
    return int(rank_prev) - int(live_rank)
