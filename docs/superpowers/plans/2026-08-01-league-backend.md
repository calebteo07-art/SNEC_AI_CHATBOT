# League Backend (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the leaderboard a promotion-only weekly league — divisions, a promotion line, movement arrows, a Monday result — with the rollover running lazily on read, no cron and no Celery.

**Architecture:** A pure, I/O-free core (`tools/gamification/league.py`) holds every rule; the router wires DB reads to it, exactly as `leaderboard.py` already does. State lands in three places: new columns on `student_profiles`, a `league_week` history table, and a `league_seal` table whose primary key makes once-per-period work idempotent under concurrent requests. Every new column and table is optional — absent ⇒ the board behaves like today's, so `main` stays deployable before migration 016 is applied.

**Tech Stack:** Python 3.12, FastAPI, Supabase (postgrest-py async client), pytest. No new dependencies.

---

## Scope

Phase 1 of `docs/superpowers/specs/2026-08-01-leaderboard-league-design.md` — **backend only**.
The frontend rebuild ("The Beam") is Phase 2 and gets its own plan once this is green, per the
standing rule that the backend works fully first.

## Amendment A — pool splitting is out of the live mechanic (2026-08-01)

**Post-implementation.** This plan was executed as written, then Task 7's rollover was corrected
in `30133af` / `6bcaf9a`: it no longer calls `split_pools`. The tasks below are kept as the
executed record; the two that diverged (Task 3, Task 7) carry inline notes at the point of
divergence.

A division is ranked as **one pool, always**, on both sides of the mechanic. Splitting only the
rollover — while `GET /api/leaderboard` ranked the whole division unsplit — meant that above
`POOL_MAX` (30) a student raced one population all week and was judged against another at the
close, and migration 016 puts everyone in division 1, so that was the launch-day state, not a
future risk. `split_pools` stays in `league.py`, pure and tested, called by nothing. An
oversized division now trips a `league_pool_max_exceeded` audit event instead. Full reasoning:
§10 of the spec and the module docstring of `tools/gamification/league_rollover.py`.

## File Structure

| File | Responsibility |
|---|---|
| `tools/gamification/league.py` | **Create.** Pure rules: divisions, promote counts, week closing, rank deltas — plus `split_pools`, which per Amendment A ends up reserved and uncalled. No imports from `db`, no I/O. |
| `tools/gamification/leaderboard.py` | **Modify.** `rank_entries` gains division scoping and emits `division` + `rank_delta` per entry. |
| `tools/db/migrations/016_leagues.sql` | **Create.** Columns + `league_week` + `league_seal`. |
| `tools/shared/db.py` | **Modify.** `take_seal`, `upsert_league_week`, `get_league_week`, `get_league_week_all`, `set_rank_prev_bulk`. |
| `tools/profile/update_profile.py` | **Modify.** Seal the outgoing week's score before `weekly_tally` overwrites it. |
| `tools/api/routers/student.py` | **Modify.** Leaderboard payload, rollover trigger, daily snapshot trigger, the two result endpoints. |
| `tests/gamification/test_league.py` | **Create.** Pure core. |
| `tests/gamification/test_league_rollover.py` | **Create.** Sealing, idempotency, the 00:00-Monday race. |
| `tests/api/test_league_endpoints.py` | **Create.** Payload, result endpoints, show-once, degradation. |

---

## Task 1: Divisions and promote counts

**Files:**
- Create: `tools/gamification/league.py`
- Test: `tests/gamification/test_league.py`

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/gamification/test_league.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.gamification.league'`

- [ ] **Step 3: Write minimal implementation**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/gamification/test_league.py -q`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/gamification/league.py tests/gamification/test_league.py
git commit -m "feat(league): division ladder + promote-count rule"
```

---

## Task 2: Closing a week

**Files:**
- Modify: `tools/gamification/league.py`
- Test: `tests/gamification/test_league.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/gamification/test_league.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/gamification/test_league.py -q`
Expected: FAIL — `ImportError: cannot import name 'close_week'`

- [ ] **Step 3: Write minimal implementation**

Append to `tools/gamification/league.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/gamification/test_league.py -q`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/gamification/league.py tests/gamification/test_league.py
git commit -m "feat(league): close_week outcomes — promoted/held/placed"
```

---

## Task 3: Pool splitting and rank deltas

> **Amendment A (2026-08-01):** `split_pools` is still built here and still tested here, but
> nothing in the shipped system calls it — see Task 7. Keep it as a reserved primitive; do not
> wire it into the rollover or the board.

**Files:**
- Modify: `tools/gamification/league.py`
- Test: `tests/gamification/test_league.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/gamification/test_league.py`:

```python
from datetime import date

from tools.gamification.league import POOL_MAX, rank_delta, split_pools

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
    assert rank_delta(live_rank=4, rank_prev=7) == 3     # 7th → 4th = climbed 3
    assert rank_delta(live_rank=9, rank_prev=6) == -3
    assert rank_delta(live_rank=4, rank_prev=4) == 0


def test_rank_delta_is_none_without_a_prior_snapshot():
    """New this week, or pre-migration — the UI must show a dash, not a fake zero."""
    assert rank_delta(live_rank=4, rank_prev=None) is None
    assert rank_delta(live_rank=None, rank_prev=4) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/gamification/test_league.py -q`
Expected: FAIL — `ImportError: cannot import name 'rank_delta'`

- [ ] **Step 3: Write minimal implementation**

Append to `tools/gamification/league.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/gamification/test_league.py -q`
Expected: PASS (21 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/gamification/league.py tests/gamification/test_league.py
git commit -m "feat(league): stable pool splitting + rank deltas"
```

---

## Task 4: Migration 016

**Files:**
- Create: `tools/db/migrations/016_leagues.sql`

**Do NOT apply it yet.** It is applied via `/db-migrate` at the end of Phase 3; every task
below must work with these columns absent.

- [ ] **Step 1: Write the migration**

```sql
-- Migration 016: promotion-only weekly leagues.
-- Run via the Supabase SQL editor (see the /db-migrate command). Never paste a file path.
--
-- The leaderboard becomes a weekly league: a student sits in a division, the top slice of
-- their division promotes every SGT Monday, and nobody is ever demoted. The rollover runs
-- lazily on the first board read of a new week rather than on a cron — league_seal makes
-- that once-per-period work idempotent under concurrent requests, since its primary key
-- rejects the second writer.
--
-- The application degrades gracefully until this is applied: an absent `division` reads as
-- Bronze, absent rank_prev means no movement arrows, and the rollover is skipped entirely.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS division                SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rank_prev               SMALLINT,
  ADD COLUMN IF NOT EXISTS rank_prev_day           DATE,
  ADD COLUMN IF NOT EXISTS league_result_seen_week DATE;

-- One row per student per closed week: the history that powers the Monday result screen.
-- xp_final is written by whichever path gets there first (see tools/profile/update_profile.py);
-- rank_final + outcome are filled when the week is closed.
CREATE TABLE IF NOT EXISTS league_week (
  student_id  TEXT     NOT NULL,
  week_start  DATE     NOT NULL,
  division    SMALLINT NOT NULL DEFAULT 1,
  xp_final    INT      NOT NULL DEFAULT 0,
  rank_final  SMALLINT,
  outcome     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, week_start)
);

CREATE INDEX IF NOT EXISTS league_week_week_idx ON league_week (week_start);

-- The idempotency guard. `key` is 'week:YYYY-MM-DD' for a rollover or 'day:YYYY-MM-DD' for
-- the daily rank snapshot. First writer wins and does the work; everyone else gets a
-- duplicate-key error and skips.
CREATE TABLE IF NOT EXISTS league_seal (
  key       TEXT PRIMARY KEY,
  sealed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Verify it contains no Postgres-invalid DDL**

Run: `python -m pytest tests/db -q`
Expected: PASS — the migration linter rejects `ADD CONSTRAINT IF NOT EXISTS` and
`CREATE POLICY IF NOT EXISTS` (Postgres 42601). If `tests/db` does not exist, instead grep
the file and confirm neither phrase appears:
`grep -nE "(ADD CONSTRAINT|CREATE POLICY) IF NOT EXISTS" tools/db/migrations/016_leagues.sql`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add tools/db/migrations/016_leagues.sql
git commit -m "feat(db): migration 016 — league divisions, week history, seal table"
```

---

## Task 5: DB helpers

**Files:**
- Modify: `tools/shared/db.py`

- [ ] **Step 1: Add the helpers**

Append to `tools/shared/db.py`, after the `student_profiles` helpers:

```python
# ── leagues (migration 016) ───────────────────────────────────────────────────
# Every helper here tolerates the tables being absent: the league ships dark and lights
# up when 016 is applied, so main is deployable at every commit.

async def take_seal(key: str) -> bool:
    """Claim a once-per-period job. True means this caller won the race and must do the
    work; False means someone else already has it, or the table isn't there yet.

    A transient failure also returns False and leaves no seal row, so the next request
    simply retries — the guard is self-healing rather than a one-shot."""
    client = await _get_client()
    try:
        await client.table("league_seal").insert({"key": key}).execute()
        return True
    except Exception:
        return False


async def upsert_league_week(rows: list[dict]) -> None:
    """Persist closed-week rows. Idempotent on (student_id, week_start): replaying a
    rollover overwrites with identical values instead of duplicating history."""
    if not rows:
        return
    client = await _get_client()
    await client.table("league_week").upsert(
        rows, on_conflict="student_id,week_start",
    ).execute()


async def seal_week_score(student_id: str, week_start: str, division: int, xp_final: int) -> None:
    """Record one student's final score for a week that just closed, without clobbering a
    row the rollover already completed (`ignore_duplicates`) — this is the earn-path writer
    racing the read-path sweep, and the first correct answer wins."""
    client = await _get_client()
    await client.table("league_week").upsert(
        {"student_id": student_id, "week_start": week_start,
         "division": int(division or 1), "xp_final": int(xp_final or 0)},
        ignore_duplicates=True,
    ).execute()


async def get_league_week(student_id: str, week_start: str) -> dict | None:
    """One student's closed-week row, or None (including pre-migration)."""
    client = await _get_client()
    try:
        result = (
            await client.table("league_week").select("*")
            .eq("student_id", student_id).eq("week_start", week_start)
            .limit(1).execute()
        )
    except Exception:
        return None
    rows = result.data or []
    return rows[0] if rows else None


async def get_league_week_all(week_start: str) -> list[dict]:
    """Every stored row for a week — the rollover reads this to find who was already
    sealed by the earn path. Empty pre-migration."""
    client = await _get_client()
    try:
        result = (
            await client.table("league_week").select("*")
            .eq("week_start", week_start).execute()
        )
    except Exception:
        return []
    return result.data or []


async def set_rank_prev_bulk(ranks: dict[str, int], day: str) -> None:
    """Stamp today's rank onto each profile so tomorrow's board can show movement arrows.
    Runs once per day behind a seal, in a background task — never on the request path."""
    for student_id, rank in ranks.items():
        try:
            await update_profile(student_id, rank_prev=int(rank), rank_prev_day=day)
        except Exception:
            continue  # one bad row must not abandon the rest of the snapshot
```

- [ ] **Step 2: Verify the module still imports and the suite is unaffected**

Run: `python -m pytest tests/shared -q`
Expected: PASS, no new failures.

- [ ] **Step 3: Commit**

```bash
git add tools/shared/db.py
git commit -m "feat(db): league seal, week-history and rank-snapshot helpers"
```

---

## Task 6: The earn path seals the outgoing week

This is the race in the spec: `xp_week` is not cleared at the Monday boundary, only ignored.
A student who earns XP at 00:00 Monday before anyone opens the board would have last week's
final score overwritten and lost forever.

**Files:**
- Modify: `tools/profile/update_profile.py:212-219`
- Test: `tests/gamification/test_league_rollover.py`

- [ ] **Step 1: Write the failing test**

```python
"""The week-boundary race: xp_week is ignored at the boundary, not cleared, so the outgoing
week's final score must be sealed before the next earn overwrites it."""
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from tools.gamification.leaderboard import weekly_tally

THIS_WEEK = date(2026, 8, 3)   # Monday
LAST_WEEK = date(2026, 7, 27)  # the Monday before


def test_weekly_tally_still_discards_a_stale_stamp():
    """Guard the existing behaviour we are building on top of."""
    assert weekly_tally(5000, LAST_WEEK.isoformat(), THIS_WEEK, 50) == 50
    assert weekly_tally(5000, THIS_WEEK.isoformat(), THIS_WEEK, 50) == 5050


@pytest.mark.asyncio
@patch("tools.shared.db.seal_week_score", new_callable=AsyncMock)
async def test_earning_on_monday_seals_last_weeks_score_first(mock_seal):
    from tools.profile.update_profile import seal_outgoing_week
    await seal_outgoing_week(
        {"student_id": "u1", "xp_week": 5000,
         "xp_week_start": LAST_WEEK.isoformat(), "division": 3},
        THIS_WEEK,
    )
    mock_seal.assert_awaited_once_with("u1", LAST_WEEK.isoformat(), 3, 5000)


@pytest.mark.asyncio
@patch("tools.shared.db.seal_week_score", new_callable=AsyncMock)
async def test_no_seal_within_the_same_week(mock_seal):
    from tools.profile.update_profile import seal_outgoing_week
    await seal_outgoing_week(
        {"student_id": "u1", "xp_week": 300,
         "xp_week_start": THIS_WEEK.isoformat(), "division": 1},
        THIS_WEEK,
    )
    mock_seal.assert_not_awaited()


@pytest.mark.asyncio
@patch("tools.shared.db.seal_week_score", new_callable=AsyncMock)
async def test_no_seal_for_a_zero_score_or_a_missing_stamp(mock_seal):
    from tools.profile.update_profile import seal_outgoing_week
    await seal_outgoing_week(
        {"student_id": "u1", "xp_week": 0, "xp_week_start": LAST_WEEK.isoformat()}, THIS_WEEK)
    await seal_outgoing_week({"student_id": "u1", "xp_week": 900}, THIS_WEEK)
    mock_seal.assert_not_awaited()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/gamification/test_league_rollover.py -q`
Expected: FAIL — `ImportError: cannot import name 'seal_outgoing_week'`

- [ ] **Step 3: Write minimal implementation**

Add to `tools/profile/update_profile.py`, above the function containing the `xp_week` write:

```python
async def seal_outgoing_week(profile: dict, week_start) -> None:
    """Preserve last week's final score before `weekly_tally` overwrites it.

    xp_week is never cleared at the Monday boundary — it is ignored once xp_week_start goes
    stale. So the closed week's score is still readable right up until this student's next
    earn, and that earn destroys it. Sealing here (idempotent on the composite PK) means a
    00:00 Monday earn can no longer erase a week of work. Best-effort: a failure here must
    never block the student's XP award."""
    stamp = str(profile.get("xp_week_start") or "")
    score = int(profile.get("xp_week") or 0)
    if not stamp or stamp == week_start.isoformat() or score <= 0:
        return
    try:
        await db.seal_week_score(profile.get("student_id"), stamp,
                                 int(profile.get("division") or 1), score)
    except Exception:
        pass
```

Then, in the `xp_week` block at `tools/profile/update_profile.py:212-219`, insert the call
immediately before `new_xp_week = weekly_tally(...)`:

```python
            # xp_week (the weekly-leaderboard tally) — resets each SGT week (Monday).
            week_start = app_week_start()
            await seal_outgoing_week(profile, week_start)   # ← before the overwrite
            new_xp_week = weekly_tally(profile.get("xp_week"), profile.get("xp_week_start"),
                                       week_start, xp_delta + streak_bonus)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/gamification/test_league_rollover.py tests/profile -q`
Expected: PASS, and no regression in the existing profile tests.

- [ ] **Step 5: Commit**

```bash
git add tools/profile/update_profile.py tests/gamification/test_league_rollover.py
git commit -m "fix(league): seal the outgoing week before the Monday earn overwrites it"
```

---

## Task 7: Rollover orchestration

**Files:**
- Create: `tools/gamification/league_rollover.py`
- Test: `tests/gamification/test_league_rollover.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/gamification/test_league_rollover.py`:

```python
from unittest.mock import AsyncMock, patch

PROFILES = [
    # sealed by the earn path (already earning in the new week)
    {"student_id": "a", "division": 2, "xp_week": 40, "xp_week_start": THIS_WEEK.isoformat()},
    # still carrying the old stamp — the sweep must read these directly
    {"student_id": "b", "division": 2, "xp_week": 800, "xp_week_start": LAST_WEEK.isoformat()},
    {"student_id": "c", "division": 2, "xp_week": 600, "xp_week_start": LAST_WEEK.isoformat()},
    {"student_id": "d", "division": 2, "xp_week": 400, "xp_week_start": LAST_WEEK.isoformat()},
    {"student_id": "e", "division": 2, "xp_week": 200, "xp_week_start": LAST_WEEK.isoformat()},
    # hidden: must not rank and must not consume a promotion slot
    {"student_id": "h", "division": 2, "xp_week": 9999,
     "xp_week_start": LAST_WEEK.isoformat(), "leaderboard_hidden": True},
]
SEALED = [{"student_id": "a", "week_start": LAST_WEEK.isoformat(),
           "division": 2, "xp_final": 900}]


@pytest.mark.asyncio
@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock)
@patch("tools.shared.db.get_league_week_all", new_callable=AsyncMock, return_value=SEALED)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
async def test_rollover_merges_sealed_and_swept_scores(seal, getall, upsert, upd):
    from tools.gamification.league_rollover import run_rollover
    did = await run_rollover(PROFILES, LAST_WEEK)
    assert did is True
    rows = {r["student_id"]: r for r in upsert.await_args.args[0]}
    # 'a' comes from the sealed row (900), not from its reset live column (40)
    assert rows["a"]["xp_final"] == 900
    assert rows["a"]["rank_final"] == 1
    assert rows["b"]["rank_final"] == 2
    assert "h" not in rows                                   # hidden never ranks
    assert rows["a"]["outcome"] == "promoted"
    promoted = [sid for sid, r in rows.items() if r["outcome"] == "promoted"]
    assert len(promoted) == 3                                # pool of 5 → 3 promote


@pytest.mark.asyncio
@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock)
@patch("tools.shared.db.get_league_week_all", new_callable=AsyncMock, return_value=SEALED)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
async def test_rollover_bumps_division_only_for_the_promoted(seal, getall, upsert, upd):
    from tools.gamification.league_rollover import run_rollover
    await run_rollover(PROFILES, LAST_WEEK)
    bumped = {c.args[0]: c.kwargs.get("division") for c in upd.await_args_list}
    assert bumped == {"a": 3, "b": 3, "c": 3}                # exactly the promoted three


@pytest.mark.asyncio
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=False)
async def test_rollover_is_a_noop_when_another_worker_holds_the_seal(seal, upsert):
    """Idempotency is the headline: a second caller must write nothing at all."""
    from tools.gamification.league_rollover import run_rollover
    assert await run_rollover(PROFILES, LAST_WEEK) is False
    upsert.assert_not_awaited()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/gamification/test_league_rollover.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.gamification.league_rollover'`

- [ ] **Step 3: Write minimal implementation**

> **Amendment A (2026-08-01) — do not copy the `split_pools` loop out of the snippet below.**
> It shipped that way and was reverted in `30133af`: the live board never split, so above
> `POOL_MAX` the rollover and the board ranked different populations, and migration 016 puts
> the whole cohort in division 1. Rank each division as one list, and trip an audit event if
> it outgrows `POOL_MAX`:
>
> ```python
> from tools.gamification.league import POOL_MAX, close_week   # no split_pools
>
>     for division, members in by_division.items():
>         if len(members) > POOL_MAX:
>             await db.insert_audit_event(...)   # league_pool_max_exceeded, best-effort
>         standings = sorted(
>             ({"student_id": p["student_id"], "xp_final": scores.get(p["student_id"], 0)}
>              for p in members),
>             key=lambda s: (-s["xp_final"], s["student_id"]),
>         )
>         all_rows.extend(close_week(standings, division))
> ```
>
> `tools/gamification/league_rollover.py` is the source of truth — its module docstring carries
> the full reasoning, and the seal-release error handling it grew later is not in this snippet
> either.

```python
"""Close the previous league week — lazily, on the first board read of a new week.

There is no cron and no Celery beat in this app (the one existing queue has a known
silent-drop bug), so the rollover is triggered by traffic and made safe by a database
seal rather than by a scheduler or an in-process lock. That also satisfies the
no-shared-in-process-state invariant: any worker can win the seal, and only one will.
"""
from datetime import date

from tools.gamification.league import close_week, split_pools
from tools.shared import db


def _final_scores(profiles: list[dict], sealed: list[dict], week_start: date) -> dict[str, int]:
    """Each student's final score for the closed week.

    Two writers feed this. The earn path seals a score when a student earns in the new week
    (their live xp_week has already been reset, so the sealed row is the only truth). Anyone
    who has not earned still carries the old stamp, so their live column is still correct."""
    stamp = week_start.isoformat()
    scores = {r["student_id"]: int(r.get("xp_final") or 0)
              for r in sealed if str(r.get("week_start")) == stamp}
    for p in profiles:
        sid = p.get("student_id")
        if sid in scores:
            continue
        if str(p.get("xp_week_start") or "") == stamp:
            scores[sid] = int(p.get("xp_week") or 0)
    return scores


async def run_rollover(profiles: list[dict], week_start: date) -> bool:
    """Close `week_start`. Returns True if this caller did the work, False if someone else
    already holds the seal (or the tables aren't there yet). Safe to call on every read."""
    if not await db.take_seal(f"week:{week_start.isoformat()}"):
        return False

    sealed = await db.get_league_week_all(week_start.isoformat())
    scores = _final_scores(profiles, sealed, week_start)

    # Hidden students are dropped here, before ranking — a hidden student must never
    # occupy a promotion slot that a visible student can see going unused.
    visible = [p for p in profiles if not p.get("leaderboard_hidden")]

    by_division: dict[int, list[dict]] = {}
    for p in visible:
        sid = p.get("student_id")
        if sid not in scores:
            continue  # played no part in the closed week
        by_division.setdefault(int(p.get("division") or 1), []).append(p)

    all_rows: list[dict] = []
    for division, members in by_division.items():
        pools = split_pools([p["student_id"] for p in members], week_start)
        for pool in pools:
            standings = sorted(
                ({"student_id": sid, "xp_final": scores.get(sid, 0)} for sid in pool),
                key=lambda s: (-s["xp_final"], s["student_id"]),
            )
            all_rows.extend(close_week(standings, division))

    persisted = [{k: v for k, v in r.items() if k != "next_division"}
                 | {"week_start": week_start.isoformat()} for r in all_rows]
    await db.upsert_league_week(persisted)

    for r in all_rows:
        if r["outcome"] == "promoted":
            try:
                await db.update_profile(r["student_id"], division=r["next_division"])
            except Exception:
                continue  # one failed bump must not abandon the rest of the cohort
    return True
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/gamification/test_league_rollover.py -q`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/gamification/league_rollover.py tests/gamification/test_league_rollover.py
git commit -m "feat(league): lazy sealed weekly rollover — no cron, idempotent"
```

---

## Task 8: Division scoping in rank_entries

**Files:**
- Modify: `tools/gamification/leaderboard.py:71-110`
- Test: `tests/gamification/test_leaderboard.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/gamification/test_leaderboard.py`:

```python
def test_ranks_within_the_viewers_division():
    profiles = [
        _p("a", 100, division=2, xp_week=900, xp_week_start=WEEK.isoformat()),
        _p("b", 100, division=3, xp_week=999, xp_week_start=WEEK.isoformat()),
        _p("c", 100, division=2, xp_week=700, xp_week_start=WEEK.isoformat()),
    ]
    names = {"a": "Ann Aa", "b": "Bob Bb", "c": "Cy Cc"}
    out = rank_entries(profiles, names, viewer_id="a", week_start=WEEK, division=2)
    assert [e["name"] for e in out] == ["Ann Aa", "Cy Cc"]   # Bob is in another division
    assert [e["rank"] for e in out] == [1, 2]


def test_entries_carry_division_and_rank_delta():
    profiles = [
        _p("a", 100, division=2, xp_week=900, xp_week_start=WEEK.isoformat(), rank_prev=4),
        _p("c", 100, division=2, xp_week=700, xp_week_start=WEEK.isoformat()),
    ]
    names = {"a": "Ann Aa", "c": "Cy Cc"}
    out = rank_entries(profiles, names, viewer_id="a", week_start=WEEK, division=2)
    assert out[0]["division"] == 2
    assert out[0]["rank_delta"] == 3          # was 4th, now 1st
    assert out[1]["rank_delta"] is None       # no prior snapshot → dash, not a fake 0


def test_division_none_ranks_everyone_as_before():
    """Pre-migration: no division column anywhere ⇒ one board, unchanged behaviour."""
    profiles = [_p("a", 300), _p("b", 500)]
    names = {"a": "Ann Aa", "b": "Bob Bb"}
    out = rank_entries(profiles, names, viewer_id="a", division=None)
    assert [e["rank"] for e in out] == [1, 2]
    assert out[0]["division"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/gamification/test_leaderboard.py -q`
Expected: FAIL — `TypeError: rank_entries() got an unexpected keyword argument 'division'`

- [ ] **Step 3: Write minimal implementation**

In `tools/gamification/leaderboard.py`, add the import and change `rank_entries`:

```python
from tools.gamification.league import rank_delta
```

Change the signature (add one parameter, keep every existing one) and the filter:

```python
def rank_entries(
    profiles: list[dict],
    names: dict[str, str],
    viewer_id: str,
    role: str | None = None,
    today: date | None = None,
    week_start: date | None = None,
    division: int | None = None,
) -> list[dict]:
```

Replace the `rows = [...]` comprehension with:

```python
    rows = [
        p for p in profiles
        if not p.get("leaderboard_hidden")
        and (role is None or (p.get("role") or "") == role)
        and (division is None or int(p.get("division") or 1) == int(division))
    ]
```

And add two keys to the appended entry dict, after `"streak_days"`:

```python
            "division": int(p.get("division") or 1),
            "rank_delta": rank_delta(i + 1, p.get("rank_prev")),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/gamification -q`
Expected: PASS — the new tests plus every existing leaderboard test unchanged.

- [ ] **Step 5: Commit**

```bash
git add tools/gamification/leaderboard.py tests/gamification/test_leaderboard.py
git commit -m "feat(league): scope ranking to a division, emit rank deltas"
```

---

## Task 9: Leaderboard endpoint payload

**Files:**
- Modify: `tools/api/routers/student.py:599-655`
- Test: `tests/api/test_league_endpoints.py`

- [ ] **Step 1: Write the failing test**

```python
"""League endpoints — payload shape, the rollover trigger, the Monday result, and the
pre-migration degradation path that keeps main deployable before 016 is applied."""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _cookies(sub="user_001"):
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


LEAGUE_PROFILES = [
    {"student_id": "user_001", "xp": 8000, "role": "OA", "division": 3,
     "xp_week": 7660, "xp_week_start": "2026-08-03", "rank_prev": 7, "streak": 9},
    {"student_id": "user_002", "xp": 9000, "role": "OT", "division": 3,
     "xp_week": 12480, "xp_week_start": "2026-08-03", "rank_prev": 1},
    {"student_id": "user_009", "xp": 400, "role": "OA", "division": 1,
     "xp_week": 90, "xp_week_start": "2026-08-03"},
]
CONSENT = [
    {"student_id": "user_001", "student_name": "Ann Aa"},
    {"student_id": "user_002", "student_name": "Bob Bb"},
    {"student_id": "user_009", "student_name": "Zed Zz"},
]


@patch("tools.gamification.league_rollover.run_rollover", new_callable=AsyncMock, return_value=False)
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
       return_value=LEAGUE_PROFILES)
def test_board_is_scoped_to_the_viewers_division(mock_p, mock_c, mock_r):
    r = client.get("/api/leaderboard", cookies=_cookies("user_001"))
    assert r.status_code == 200
    body = r.json()
    assert body["division"] == 3
    assert body["division_name"] == "Gold"
    assert [e["name"] for e in body["entries"]] == ["Bob Bb", "Ann Aa"]  # Zed is Bronze
    assert body["pool_size"] == 2
    assert body["promote_count"] == 1        # a pool of 2: only the winner
    assert body["entries"][1]["rank_delta"] == 5   # Ann was 7th, now 2nd


@patch("tools.gamification.league_rollover.run_rollover", new_callable=AsyncMock, return_value=False)
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
       return_value=LEAGUE_PROFILES)
def test_role_filter_never_changes_who_you_race(mock_p, mock_c, mock_r):
    """The filter is a view. promote_count and pool_size must still describe the real pool."""
    r = client.get("/api/leaderboard?role=OA", cookies=_cookies("user_001"))
    body = r.json()
    assert [e["name"] for e in body["entries"]] == ["Ann Aa"]
    assert body["pool_size"] == 2
    assert body["promote_count"] == 1


PRE_MIGRATION = [
    {"student_id": "user_001", "xp": 300, "role": "OA"},
    {"student_id": "user_002", "xp": 500, "role": "OT"},
]


@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
       return_value=PRE_MIGRATION)
def test_pre_migration_board_is_correct_and_boring(mock_p, mock_c):
    """No division column anywhere ⇒ one Bronze board, no arrows, and no 500."""
    r = client.get("/api/leaderboard", cookies=_cookies("user_001"))
    assert r.status_code == 200
    body = r.json()
    assert body["division"] == 1
    assert body["division_name"] == "Bronze"
    assert len(body["entries"]) == 2
    assert all(e["rank_delta"] is None for e in body["entries"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_league_endpoints.py -q`
Expected: FAIL — `KeyError: 'division'` (the response model has no such field).

- [ ] **Step 3: Write minimal implementation**

In `tools/api/routers/student.py`, extend the models:

```python
class LbEntry(BaseModel):
    rank: int
    name: str
    role: str
    xp: int          # XP earned THIS week — the weekly-board score + ranking key
    xp_total: int    # lifetime XP — drives level/prestige
    level: int
    streak_days: int
    avatar_config: dict | None = None
    is_you: bool
    division: int = 1
    rank_delta: int | None = None   # places gained since the last daily snapshot


class LbResponse(BaseModel):
    entries: list[LbEntry]
    you_hidden: bool
    display_name: str | None = None
    roles: list[str]
    division: int = 1
    division_name: str = "Bronze"
    pool_size: int = 0        # the real pool, unaffected by the role view filter
    promote_count: int = 0
```

Replace the body of `leaderboard()` between the `names = {...}` line and the `return`:

```python
    names = {r["student_id"]: (r.get("student_name") or "") for r in consent}
    from tools.gamification.league import division_name, promote_count
    from tools.shared.clock import app_today, app_week_start

    weekly_ready = any("xp_week_start" in p for p in profiles)
    week_start = app_week_start() if weekly_ready else None

    me = next((p for p in profiles if p.get("student_id") == student_id), {})
    # Absent column (pre-migration) ⇒ None ⇒ one undivided board, exactly as today.
    league_ready = any("division" in p for p in profiles)
    my_division = int(me.get("division") or 1) if league_ready else None

    entries = rank_entries(profiles, names, viewer_id=student_id, role=role or None,
                           today=app_today(), week_start=week_start,
                           division=my_division)
    # The pool is everyone in the division regardless of the role *view* filter — the
    # filter must never change who you are actually racing or the ranks stop meaning
    # anything. Hidden students are excluded here too: they hold no promotion slot.
    pool = [p for p in profiles
            if not p.get("leaderboard_hidden")
            and (my_division is None or int(p.get("division") or 1) == my_division)]
    roles = sorted({(p.get("role") or "").strip() for p in profiles if (p.get("role") or "").strip()})
    return LbResponse(
        entries=[LbEntry(**e) for e in entries],
        you_hidden=bool(me.get("leaderboard_hidden")),
        display_name=(me.get("display_name") or None),
        roles=roles,
        division=my_division or 1,
        division_name=division_name(my_division),
        pool_size=len(pool),
        promote_count=promote_count(len(pool)),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/api/test_league_endpoints.py tests/api/test_leaderboard_endpoint.py -q`
Expected: PASS — including every pre-existing leaderboard endpoint test.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/student.py tests/api/test_league_endpoints.py
git commit -m "feat(api): division-scoped leaderboard payload with promotion line data"
```

---

## Task 10: Trigger the rollover and the daily snapshot from the board read

**Files:**
- Modify: `tools/api/routers/student.py` (the `leaderboard` handler)
- Test: `tests/api/test_league_endpoints.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/api/test_league_endpoints.py`:

```python
from datetime import date


@patch("tools.shared.db.set_rank_prev_bulk", new_callable=AsyncMock)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
@patch("tools.gamification.league_rollover.run_rollover", new_callable=AsyncMock, return_value=True)
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
       return_value=LEAGUE_PROFILES)
def test_board_read_triggers_the_previous_weeks_rollover(mock_p, mock_c, roll, seal, bulk):
    r = client.get("/api/leaderboard", cookies=_cookies("user_001"))
    assert r.status_code == 200
    roll.assert_awaited_once()
    # It closes the week BEFORE the current one, never the live week.
    closed = roll.await_args.args[1]
    assert closed < date.today()


@patch("tools.shared.db.set_rank_prev_bulk", new_callable=AsyncMock)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
@patch("tools.gamification.league_rollover.run_rollover", new_callable=AsyncMock, return_value=False)
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
       return_value=LEAGUE_PROFILES)
def test_daily_snapshot_records_every_visible_rank_once(mock_p, mock_c, roll, seal, bulk):
    client.get("/api/leaderboard", cookies=_cookies("user_001"))
    ranks = bulk.await_args.args[0]
    assert ranks == {"user_002": 1, "user_001": 2, "user_009": 1}  # per-division ranks


@patch("tools.shared.db.set_rank_prev_bulk", new_callable=AsyncMock)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=False)
@patch("tools.gamification.league_rollover.run_rollover", new_callable=AsyncMock, return_value=False)
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
       return_value=LEAGUE_PROFILES)
def test_second_read_of_the_day_writes_no_snapshot(mock_p, mock_c, roll, seal, bulk):
    """Without this, every request would restamp rank_prev and all arrows would read 0."""
    client.get("/api/leaderboard", cookies=_cookies("user_001"))
    bulk.assert_not_awaited()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_league_endpoints.py -q`
Expected: FAIL — `AssertionError: Expected 'run_rollover' to have been awaited once. Awaited 0 times.`

- [ ] **Step 3: Write minimal implementation**

In `tools/api/routers/student.py`, add `BackgroundTasks` to the handler signature:

```python
@router.get("/api/leaderboard", response_model=LbResponse)
async def leaderboard(background: BackgroundTasks, role: str | None = None,
                      current_user: CurrentUser = Depends(get_current_user)):
```

(`BackgroundTasks` is already imported by this router for the OSCE submit path; if not,
add `from fastapi import BackgroundTasks`.)

Then, immediately after `entries = rank_entries(...)`, add:

```python
    # Two lazy, seal-guarded jobs ride on board traffic — there is no cron in this app.
    # Both do their work in a background task so no student ever waits for them.
    if league_ready:
        from datetime import timedelta

        from tools.gamification.league_rollover import run_rollover
        background.add_task(run_rollover, profiles, week_start - timedelta(days=7))

        today = app_today()
        if await db.take_seal(f"day:{today.isoformat()}"):
            # Everyone's rank today, per division, so tomorrow's arrows are coherent for
            # the whole cohort rather than relative to whenever each student last looked.
            snapshot: dict[str, int] = {}
            for d in {int(p.get("division") or 1) for p in profiles}:
                for e in rank_entries(profiles, names, viewer_id=student_id,
                                      today=today, week_start=week_start, division=d):
                    sid = next((p["student_id"] for p in profiles
                                if _resolved_name(p, names) == e["name"]), None)
                    if sid:
                        snapshot[sid] = e["rank"]
            background.add_task(db.set_rank_prev_bulk, snapshot, today.isoformat())
```

Add the import at the top of the module: `from tools.gamification.leaderboard import _resolved_name`.

> **Note for the implementer:** matching entries back to student ids by resolved name is
> fragile if two students resolve to the same display name. If `rank_entries` can be given a
> `student_id` passthrough on each entry instead, prefer that — it is a two-line change to
> `leaderboard.py` (`"student_id": sid,` in the entry dict) and it removes the lookup
> entirely. Do **not** expose `student_id` in `LbEntry`; strip it in the router.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/api -q`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/student.py tests/api/test_league_endpoints.py
git commit -m "feat(api): ride the rollover + daily rank snapshot on board traffic"
```

---

## Task 11: The Monday result endpoints (show-once)

**Files:**
- Modify: `tools/api/routers/student.py`
- Test: `tests/api/test_league_endpoints.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/api/test_league_endpoints.py`:

```python
LAST = "2026-07-27"
RESULT_ROW = {"student_id": "user_001", "week_start": LAST, "division": 2,
              "xp_final": 7660, "rank_final": 2, "outcome": "promoted"}


@patch("tools.shared.db.get_profile", new_callable=AsyncMock,
       return_value={"student_id": "user_001", "division": 3})
@patch("tools.shared.db.get_league_week", new_callable=AsyncMock, return_value=RESULT_ROW)
def test_unseen_result_is_returned_with_both_division_names(mock_lw, mock_p):
    r = client.get("/api/league/result", cookies=_cookies("user_001"))
    assert r.status_code == 200
    body = r.json()
    assert body["outcome"] == "promoted"
    assert body["rank_final"] == 2
    assert body["from_division_name"] == "Silver"
    assert body["to_division_name"] == "Gold"


@patch("tools.shared.db.get_profile", new_callable=AsyncMock,
       return_value={"student_id": "user_001", "division": 3,
                     "league_result_seen_week": LAST})
@patch("tools.shared.db.get_league_week", new_callable=AsyncMock, return_value=RESULT_ROW)
def test_result_is_not_returned_twice(mock_lw, mock_p):
    """The show-once invariant. This is the repeat case, and it is the whole point of
    the test — a ceremony that re-fires every load is the bug this app has shipped before."""
    r = client.get("/api/league/result", cookies=_cookies("user_001"))
    assert r.status_code == 200
    assert r.json() == {"result": None}


@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
def test_marking_seen_stores_the_week_server_side(mock_upd):
    r = client.post("/api/league/result/seen", json={"week_start": LAST},
                    cookies=_cookies("user_001"))
    assert r.status_code == 200
    mock_upd.assert_awaited_once_with("user_001", league_result_seen_week=LAST)


@patch("tools.shared.db.get_profile", new_callable=AsyncMock, return_value={})
@patch("tools.shared.db.get_league_week", new_callable=AsyncMock, return_value=None)
def test_no_history_yet_is_a_null_result_not_a_500(mock_lw, mock_p):
    r = client.get("/api/league/result", cookies=_cookies("user_001"))
    assert r.status_code == 200
    assert r.json() == {"result": None}


def test_result_endpoints_require_auth():
    assert client.get("/api/league/result").status_code in (401, 403)
    assert client.post("/api/league/result/seen", json={"week_start": LAST}
                       ).status_code in (401, 403)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_league_endpoints.py -q`
Expected: FAIL — 404 on `/api/league/result`.

- [ ] **Step 3: Write minimal implementation**

Add to `tools/api/routers/student.py`, after `leaderboard_prefs`:

```python
class LeagueSeen(BaseModel):
    week_start: str


@router.get("/api/league/result")
@limiter.shared_limit("60/minute", scope="league")
async def league_result(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """The viewer's outcome for the most recently closed week, or null once they've seen it.

    The seen-flag lives on the profile, not in localStorage, so the Monday ceremony fires
    exactly once per student across every device they use."""
    student_id = current_user["sub"]
    from datetime import timedelta

    from tools.gamification.league import division_name
    from tools.shared.clock import app_week_start

    last_week = (app_week_start() - timedelta(days=7)).isoformat()
    try:
        row = await db.get_league_week(student_id, last_week)
        profile = await db.get_profile(student_id) or {}
    except Exception:
        return {"result": None}
    if not row:
        return {"result": None}
    if str(profile.get("league_result_seen_week") or "") == last_week:
        return {"result": None}

    from_div = int(row.get("division") or 1)
    to_div = from_div + 1 if row.get("outcome") == "promoted" else from_div
    return {
        "week_start": last_week,
        "outcome": row.get("outcome"),
        "rank_final": row.get("rank_final"),
        "xp_final": row.get("xp_final"),
        "from_division_name": division_name(from_div),
        "to_division_name": division_name(to_div),
    }


@router.post("/api/league/result/seen")
@limiter.shared_limit("60/minute", scope="league")
async def league_result_seen(request: Request, body: LeagueSeen,
                             current_user: CurrentUser = Depends(get_current_user)):
    """Mark this week's result as seen. Identity is the JWT sub, never the body."""
    try:
        await db.update_profile(current_user["sub"], league_result_seen_week=body.week_start)
    except Exception:
        return {"ok": False}
    return {"ok": True}
```

> **Note for the implementer:** check how sibling endpoints in this router declare rate
> limits before copying the decorator — memory of this codebase records that `slowapi` with
> `key_style=url` needs `shared_limit(scope=...)`. Match the surrounding pattern exactly, and
> keep the `request: Request` parameter, which slowapi requires.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/api/test_league_endpoints.py -q`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/student.py tests/api/test_league_endpoints.py
git commit -m "feat(api): Monday league result with a server-side show-once flag"
```

---

## Task 12: Full suite, then push

- [ ] **Step 1: Run the whole backend suite**

Run: `python -m pytest -q`
Expected: PASS. Investigate any failure before continuing — do not push red.

> The working tree may carry unrelated dirty files from a concurrent session
> (`tests/api/test_admin_endpoints.py`, `tools/api/routers/admin.py`, `tools/shared/db.py`,
> `tools/supervisor/trend.py` and friends were dirty when this plan was written). Stage only
> the files this plan touches.

- [ ] **Step 2: Confirm the pre-migration path one more time**

Run: `python -m pytest tests/api/test_league_endpoints.py::test_pre_migration_board_is_correct_and_boring -v`
Expected: PASS. This is the proof that `main` is deployable before 016 is applied.

- [ ] **Step 3: Verify the remote hasn't moved, then push**

```bash
git fetch origin main
git status -sb
git push origin main
```

Expected: `# branch.ab +N -0` before pushing. If it shows `-N`, another session moved `main`
— rebase and re-run the suite before pushing.

- [ ] **Step 4: Check CI, don't assume it**

```bash
gh run list --branch main --limit 3
```

Expected: the run for your commit is green. `main` has sat red for a day before while
commits shipped "verified green" off local gates alone.

---

## Phase 1 exit criteria

- `python -m pytest -q` green.
- The board is division-scoped, carries `promote_count` / `pool_size` / `rank_delta`, and
  returns a correct, boring board when the 016 columns are absent.
- The rollover is idempotent: a second caller writes nothing.
- A student earning at 00:00 Monday keeps their closed-week score.
- Hidden students neither rank nor hold a promotion slot.
- The Monday result fires once per student, server-side, and does not re-fire.

Phase 2 (the "Beam" frontend) gets its own plan, written against this working backend.

## Self-review notes

- **Amendment A (2026-08-01):** §3's pool-splitting bullet was superseded *after* this plan ran
  — the rollover ranks each division as one pool and `split_pools` is now uncalled. See the
  Amendment A section above and §10 of the spec before trusting the coverage map below.
- **Spec coverage:** §3 mechanics → Tasks 1-3, 7. §4.1 migration → Task 4 (revised to a
  single `league_seal(key TEXT)` serving both the weekly rollover and the daily snapshot;
  the spec's §4.1 should be updated to match). §4.2 degradation → Tasks 9, 12. §4.3 the
  race → Tasks 6, 7. §5 backend shape → Tasks 5, 8-11. §7 testing → every task.
  §6 frontend and the ceremony *screen* are Phase 2/3 and deliberately absent here.
- **Known soft spot:** Task 10 matches entries back to student ids by resolved name. The
  inline note gives the better fix (pass `student_id` through `rank_entries` and strip it in
  the router); take it if the implementer touches that code.
