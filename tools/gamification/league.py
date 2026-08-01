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


def division_name(division) -> str:
    """Display name for a division level. Clamps rather than raising: a null column
    (pre-migration) or a bad value must never 500 the board."""
    try:
        d = int(division)
    except (TypeError, ValueError):
        d = 1
    d = max(1, min(TOP_DIVISION, d))
    return DIVISIONS[d - 1][1]


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
