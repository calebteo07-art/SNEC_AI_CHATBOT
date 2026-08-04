# Home Game Loop — Phase 1 "The Loop" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Home the backend of an addictive game — three daily quests, a daily chest, and time-boxed XP boosts — without changing a single pixel yet.

**Architecture:** `update_profile()` is the one funnel every Lumen in the app is credited through, so it becomes the single writer of a daily activity tally. Everything else — the quest set, each quest's progress, the chest drop, the boost multiplier — is a **pure function** of state that one writer already maintains. Nothing is separately advanced, so nothing can drift out of sync. Only *claims* are persisted.

**Tech Stack:** Python 3.12, FastAPI, Supabase (Postgres), pytest. No AI calls, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-04-homepage-game-hud-design.md`

---

## Economy rules (memorise these — every task depends on them)

1. **The chest pays boosts. Quests pay XP.** The chest is free for showing up, so it may only pay something you must *study* to convert. A quest already requires studying, so XP is safe. Neither can buy League rank.
2. **Penalties never scale.** `apply_division_bonus` passes anything `<= 0` through untouched. The boost must obey the identical rule — a forfeit is −30 flat at every division under every boost.
3. **Never use Python's `hash()` for determinism.** `hash()` on a `str` is salted per interpreter process (`PYTHONHASHSEED`), so two uvicorn workers would disagree about today's chest. Use `hashlib.sha256`.
4. **A failed read renders as `null`, never `0`.** Home painting "Level 1 · 0 XP" as fact is a bug this codebase has already shipped and explicitly guards against in `Dashboard.tsx`.

---

## File structure

| File | Responsibility |
|---|---|
| `tools/db/migrations/018_home_game_loop.sql` | 3 nullable columns on `student_profiles` |
| `tools/gamification/daily_state.py` | pure: read/reset the daily blob, record one activity |
| `tools/gamification/quests.py` | pure: generate the day's 3 quests, compute progress |
| `tools/gamification/chest.py` | pure: roll the day's drop, resolve the boost multiplier |
| `tools/gamification/league.py` | **modify**: one line — `apply_division_bonus` gains `boost` |
| `tools/profile/update_profile.py` | **modify**: `source` arg, activity write, boost in `gain` |
| `tools/api/routers/home.py` | `GET /api/home`, the two claim endpoints |
| `tools/api/server.py` | **modify**: register the router |

Tests mirror the source tree: `tests/gamification/test_daily_state.py`, `test_quests.py`, `test_chest.py`, `test_boost_multiplier.py`, and `tests/api/test_home_endpoints.py`.

---

### Task 1: Migration 018

**Files:**
- Create: `tools/db/migrations/018_home_game_loop.sql`
- Modify: `tools/db/migrations/APPLIED.md`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 018: the Home game loop — daily quests, the daily chest, timed boosts.
-- Run via the Supabase SQL editor (see the /db-migrate command). Never paste a file path.
--
-- Three nullable columns, mirroring the existing xp_today / xp_today_date pattern: a
-- daily blob plus the SGT day it belongs to, so a stale stamp reads as empty and no reset
-- job is ever needed. `boosts` is durable and deliberately outlives the day.
--
-- The application degrades gracefully until this is applied: daily_state reads as empty,
-- so quests show zero progress, the chest is unclaimable and the boost multiplier is 1.0.
-- The app is fully functional; the mechanics are simply dark. Same as how 016 shipped.

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS daily_state      JSONB,
  ADD COLUMN IF NOT EXISTS daily_state_date DATE,
  ADD COLUMN IF NOT EXISTS boosts           JSONB;
```

- [ ] **Step 2: Record it as NOT yet applied**

Append to `tools/db/migrations/APPLIED.md`:

```markdown
- [ ] 018_home_game_loop.sql — NOT YET APPLIED (`daily_state`/`daily_state_date`/`boosts` on `student_profiles`, for the Home game loop: daily quests, the daily chest and timed XP boosts). Ships dark and is safe to deploy before the migration runs — every read tolerates the absent columns, so quests read zero progress, the chest is unclaimable and the boost multiplier stays 1.0.
```

- [ ] **Step 3: Commit**

```bash
git add tools/db/migrations/018_home_game_loop.sql tools/db/migrations/APPLIED.md
git commit -m "feat(home): migration 018 — daily_state + boosts for the game loop"
```

> **Do not apply this to Supabase yet.** It is applied at Task 9, after the code that reads it is green. Nothing before Task 9 requires it.

---

### Task 2: `daily_state` — the pure daily blob

**Files:**
- Create: `tools/gamification/daily_state.py`
- Test: `tests/gamification/test_daily_state.py`

- [ ] **Step 1: Write the failing tests**

```python
"""The daily activity blob — one writer, and a stale stamp means empty.

This is the substrate the whole Home game loop computes from. Two rules matter and each
has a test because each is a way to silently corrupt a student's day:
  · A daily_state_date that is not today reads as EMPTY, never as yesterday's counts.
    Without that, the first earn of a new day inherits yesterday's quest progress.
  · record_activity only counts sources it knows. A typo'd source must not invent a key
    that no quest can ever read.
"""
from datetime import date

from tools.gamification.daily_state import EMPTY_STATE, read_daily_state, record_activity

TODAY = date(2026, 8, 4)


def test_a_stale_stamp_reads_as_empty():
    profile = {"daily_state": {"activity": {"flashcards": 9}}, "daily_state_date": "2026-08-03"}
    assert read_daily_state(profile, TODAY) == EMPTY_STATE


def test_an_absent_column_reads_as_empty():
    # Pre-migration: the columns do not exist at all.
    assert read_daily_state({}, TODAY) == EMPTY_STATE


def test_todays_stamp_reads_the_stored_blob():
    stored = {"activity": {"flashcards": 3, "osce": 0, "tutor": 0, "topics": {}},
              "quests_claimed": ["adaptive"], "chest_claimed": True}
    profile = {"daily_state": stored, "daily_state_date": "2026-08-04"}
    assert read_daily_state(profile, TODAY) == stored


def test_record_activity_accumulates_a_known_source():
    state = record_activity(EMPTY_STATE, "flashcards", topic="gonioscopy")
    state = record_activity(state, "flashcards", topic="gonioscopy")
    assert state["activity"]["flashcards"] == 2
    assert state["activity"]["topics"]["gonioscopy"] == 2


def test_record_activity_ignores_an_unknown_source():
    state = record_activity(EMPTY_STATE, "typo", topic="gonioscopy")
    assert state["activity"] == EMPTY_STATE["activity"]


def test_record_activity_without_a_topic_still_counts_the_source():
    state = record_activity(EMPTY_STATE, "osce")
    assert state["activity"]["osce"] == 1
    assert state["activity"]["topics"] == {}


def test_record_activity_does_not_mutate_its_input():
    # The caller holds the profile's dict; mutating it in place would write yesterday's
    # object back under today's stamp.
    original = record_activity(EMPTY_STATE, "tutor")
    record_activity(original, "tutor")
    assert original["activity"]["tutor"] == 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/gamification/test_daily_state.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.gamification.daily_state'`

- [ ] **Step 3: Write the implementation**

```python
"""The daily activity tally — the substrate every Home quest is computed from.

Mirrors the xp_today / xp_today_date pattern already in update_profile: a blob plus the
SGT day it belongs to. A stamp that is not today reads as empty, so the day rolls over
with no reset job and no cron — the same trick xp_week_start uses for the weekly board.

Pure. No I/O, no clock of its own — the caller passes today in, so tests need no DB.
"""
import copy

# The activity keys a quest may target. A source outside this set is ignored rather than
# stored: an unrecognised key could never be read back by any quest, so recording it would
# be a silent no-op that looks like a working write.
SOURCES = ("flashcards", "osce", "tutor")

EMPTY_STATE = {
    "activity": {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}},
    "quests_claimed": [],
    "chest_claimed": False,
}


def read_daily_state(profile: dict, today) -> dict:
    """This student's state for `today`, or a fresh empty one.

    Absent columns (pre-migration 018) and a stale stamp are the same answer: empty. That
    equivalence is what lets the feature ship dark.
    """
    stamp = str(profile.get("daily_state_date") or "")
    if stamp != today.isoformat():
        return copy.deepcopy(EMPTY_STATE)
    stored = profile.get("daily_state")
    if not isinstance(stored, dict):
        return copy.deepcopy(EMPTY_STATE)
    state = copy.deepcopy(EMPTY_STATE)
    activity = stored.get("activity")
    if isinstance(activity, dict):
        for key in SOURCES:
            state["activity"][key] = int(activity.get(key) or 0)
        topics = activity.get("topics")
        if isinstance(topics, dict):
            state["activity"]["topics"] = {str(k): int(v or 0) for k, v in topics.items()}
    claimed = stored.get("quests_claimed")
    if isinstance(claimed, list):
        state["quests_claimed"] = [str(c) for c in claimed]
    state["chest_claimed"] = bool(stored.get("chest_claimed"))
    return state


def record_activity(state: dict, source: str, topic: str | None = None) -> dict:
    """One completed unit of work. Returns a NEW state — the caller still holds the
    profile's own dict, and mutating that in place would write yesterday's object back
    under today's stamp."""
    if source not in SOURCES:
        return copy.deepcopy(state)
    updated = copy.deepcopy(state)
    updated["activity"][source] = int(updated["activity"].get(source) or 0) + 1
    if topic:
        topics = updated["activity"]["topics"]
        topics[str(topic)] = int(topics.get(str(topic)) or 0) + 1
    return updated
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/gamification/test_daily_state.py -v`
Expected: PASS, 7 passed

- [ ] **Step 5: Commit**

```bash
git add tools/gamification/daily_state.py tests/gamification/test_daily_state.py
git commit -m "feat(home): the daily activity blob — a stale stamp reads as empty"
```

---

### Task 3: `quests` — the day's three missions

**Files:**
- Create: `tools/gamification/quests.py`
- Test: `tests/gamification/test_quests.py`

The set is **exactly one of each kind** — adaptive (your weakest topic), breadth (a feature you have not touched today), stretch (an XP push scaled off the daily goal) — so it is never three of the same shape.

- [ ] **Step 1: Write the failing tests**

```python
"""The three daily quests. Pure — generated from (student_id, date, weak_topics, role).

Nothing about a quest is stored, so the rules below ARE the feature:
  · Deterministic per student per day. Two uvicorn workers must agree, so the seed is
    sha256 and never Python's hash() (which is salted per process by PYTHONHASHSEED).
  · Exactly one of each kind, so a student never gets three flashcard quests.
  · Progress is computed from the activity tally, never separately advanced — which is
    what makes it impossible for a quest bar to disagree with what the student did.
"""
from datetime import date

from tools.gamification.quests import QUEST_KINDS, daily_quests, quest_progress

TODAY = date(2026, 8, 4)
WEAK = ["gonioscopy", "visual fields"]


def test_the_set_is_deterministic_for_one_student_and_day():
    a = daily_quests("ann", TODAY, WEAK, "OA")
    b = daily_quests("ann", TODAY, WEAK, "OA")
    assert [q.title for q in a] == [q.title for q in b]


def test_different_days_give_different_sets():
    a = daily_quests("ann", TODAY, WEAK, "OA")
    b = daily_quests("ann", date(2026, 8, 5), WEAK, "OA")
    assert [q.title for q in a] != [q.title for q in b]


def test_different_students_can_differ_on_the_same_day():
    # Not a guarantee for any single pair, so assert across a spread: if every student got
    # the identical set the seed is not mixing the student id in at all.
    sets = {tuple(q.title for q in daily_quests(f"s{i}", TODAY, WEAK, "OA")) for i in range(40)}
    assert len(sets) > 1


def test_exactly_one_quest_of_each_kind():
    quests = daily_quests("ann", TODAY, WEAK, "OA")
    assert sorted(q.kind for q in quests) == sorted(QUEST_KINDS)


def test_the_adaptive_quest_targets_a_weak_topic():
    quests = daily_quests("ann", TODAY, WEAK, "OA")
    adaptive = next(q for q in quests if q.kind == "adaptive")
    assert adaptive.metric.startswith("topic:")
    assert adaptive.metric.removeprefix("topic:") in WEAK


def test_the_adaptive_quest_falls_back_when_there_are_no_weak_topics():
    # A brand-new student has no retention scores yet. The set must still be three quests.
    quests = daily_quests("new", TODAY, [], "OA")
    assert len(quests) == len(QUEST_KINDS)
    adaptive = next(q for q in quests if q.kind == "adaptive")
    assert adaptive.metric == "flashcards"


def test_every_quest_has_a_positive_target_and_reward():
    for q in daily_quests("ann", TODAY, WEAK, "OA"):
        assert q.target > 0
        assert q.reward_xp > 0


def test_progress_reads_a_plain_source_metric():
    quests = daily_quests("ann", TODAY, WEAK, "OA")
    breadth = next(q for q in quests if q.kind == "breadth")
    activity = {"flashcards": 2, "osce": 1, "tutor": 0, "topics": {}, "xp": 0}
    assert quest_progress(breadth, activity) == activity[breadth.metric]


def test_progress_reads_a_topic_metric():
    quests = daily_quests("ann", TODAY, WEAK, "OA")
    adaptive = next(q for q in quests if q.kind == "adaptive")
    topic = adaptive.metric.removeprefix("topic:")
    activity = {"flashcards": 5, "osce": 0, "tutor": 0, "topics": {topic: 5}, "xp": 0}
    assert quest_progress(adaptive, activity) == 5


def test_progress_reads_the_xp_metric_from_the_activity_dict():
    # xp is NOT stored in daily_state — it already lives in xp_today. The caller merges it
    # into the activity dict, and this pins that contract.
    quests = daily_quests("ann", TODAY, WEAK, "OA")
    stretch = next(q for q in quests if q.kind == "stretch")
    assert stretch.metric == "xp"
    assert quest_progress(stretch, {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}, "xp": 75}) == 75


def test_progress_is_zero_for_an_untouched_metric():
    quests = daily_quests("ann", TODAY, WEAK, "OA")
    for q in quests:
        assert quest_progress(q, {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}, "xp": 0}) == 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/gamification/test_quests.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.gamification.quests'`

- [ ] **Step 3: Write the implementation**

```python
"""The three daily quests — the PULL the Home never had.

Generated, never stored: a quest set is a pure function of (student_id, date,
weak_topics, role), and its progress is a pure function of the daily activity tally. That
is deliberate. A stored quest with a stored progress counter is two things that can
disagree, and the one that disagrees is always the one the student is looking at.

Exactly one quest of each kind per day, so the board never shows three of the same shape.
"""
import hashlib
from dataclasses import dataclass

QUEST_KINDS = ("adaptive", "breadth", "stretch")

# Targets and payouts. Quests pay XP — unlike the chest, a quest cannot be completed
# without actually studying, so paying XP here can never buy League rank for showing up.
#
# The unit is DECKS, not cards. The activity tally increments once per completed deck (see
# tools/gamification/daily_state.py), so a quest promising "8 cards" would silently demand
# eight decks. A topic holds 5 decks, so 1-3 is a day's work, not a month's.
_ADAPTIVE_TARGETS = (1, 2, 3)
_BREADTH_SOURCES = (("osce", "Run {n} OSCE station{s}"), ("flashcards", "Clear {n} flashcard deck{s}"),
                    ("tutor", "Ask the tutor {n} question{s}"))
_STRETCH_MULTIPLES = (1.0, 1.25, 1.5)

_REWARD = {"adaptive": 40, "breadth": 30, "stretch": 50}


@dataclass(frozen=True)
class Quest:
    kind: str      # one of QUEST_KINDS
    title: str     # student-facing, e.g. "Clear 8 cards in Gonioscopy"
    metric: str    # "flashcards" | "osce" | "tutor" | "xp" | "topic:<key>"
    target: int
    reward_xp: int


def _seed(student_id: str, day) -> int:
    """Deterministic per student per day, across processes.

    sha256 and NOT hash(): Python salts str hashing per interpreter run, so two uvicorn
    workers would hand the same student two different quest sets on the same day.
    """
    raw = f"{student_id}:{day.isoformat()}".encode()
    return int.from_bytes(hashlib.sha256(raw).digest()[:8], "big")


def daily_quests(student_id: str, day, weak_topics: list[str], role: str,
                 daily_goal: int = 100) -> list[Quest]:
    """Today's three quests — one adaptive, one breadth, one stretch."""
    seed = _seed(student_id, day)

    # Adaptive: the student's weakest topic. A brand-new student has no retention scores
    # yet, so it degrades to a plain flashcard quest rather than vanishing — the set is
    # always three.
    if weak_topics:
        topic = weak_topics[seed % len(weak_topics)]
        n = _ADAPTIVE_TARGETS[(seed >> 8) % len(_ADAPTIVE_TARGETS)]
        adaptive = Quest("adaptive", f"Clear {n} deck{'' if n == 1 else 's'} in {topic.title()}",
                         f"topic:{topic}", n, _REWARD["adaptive"])
    else:
        n = _ADAPTIVE_TARGETS[(seed >> 8) % len(_ADAPTIVE_TARGETS)]
        adaptive = Quest("adaptive", f"Clear {n} flashcard deck{'' if n == 1 else 's'}",
                         "flashcards", n, _REWARD["adaptive"])

    source, template = _BREADTH_SOURCES[(seed >> 16) % len(_BREADTH_SOURCES)]
    bn = 1 + ((seed >> 24) % 2)
    breadth = Quest("breadth", template.format(n=bn, s="" if bn == 1 else "s"),
                    source, bn, _REWARD["breadth"])

    mult = _STRETCH_MULTIPLES[(seed >> 32) % len(_STRETCH_MULTIPLES)]
    xp_target = int(daily_goal * mult)
    stretch = Quest("stretch", f"Earn {xp_target} XP today", "xp", xp_target,
                    _REWARD["stretch"])

    return [adaptive, breadth, stretch]


def quest_progress(quest: Quest, activity: dict) -> int:
    """How far along this quest is, computed from the activity tally.

    `activity` carries the daily_state counters plus `xp` (which lives in the existing
    xp_today column, not in daily_state — the caller merges it in).
    """
    if quest.metric.startswith("topic:"):
        topics = activity.get("topics") or {}
        return int(topics.get(quest.metric.removeprefix("topic:")) or 0)
    return int(activity.get(quest.metric) or 0)


def is_complete(quest: Quest, activity: dict) -> bool:
    return quest_progress(quest, activity) >= quest.target
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/gamification/test_quests.py -v`
Expected: PASS, 11 passed

- [ ] **Step 5: Commit**

```bash
git add tools/gamification/quests.py tests/gamification/test_quests.py
git commit -m "feat(home): three daily quests, generated not stored"
```

---

### Task 4: `chest` — the daily drop and the boost clock

**Files:**
- Create: `tools/gamification/chest.py`
- Test: `tests/gamification/test_chest.py`

- [ ] **Step 1: Write the failing tests**

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/gamification/test_chest.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.gamification.chest'`

- [ ] **Step 3: Write the implementation**

```python
"""The daily chest — the PAYOFF for showing up — and the boost clock it winds.

The chest pays BOOSTS, never XP. That is the rule that keeps The League honest: a student
who only ever opens the app and claims a chest gains nothing on the board, because a boost
is worth exactly zero until they actually study and earn something to multiply.

The drop is a pure function of (student_id, date). Variable across days, unpredictable,
and impossible to re-roll — so a repeat claim cannot pay differently even if the first
claim's write failed.
"""
import hashlib
from dataclasses import dataclass
from datetime import datetime

# How long a claimed 2x boost runs. Short on purpose: the countdown is the pull.
BOOST_MINUTES = 20


@dataclass(frozen=True)
class Drop:
    key: str
    label: str
    boost_minutes: int = 0   # winds the xp2x clock
    freezes: int = 0         # grants streak freezes (the existing streak_freezes column)


DROPS = (
    Drop("xp2x", f"2x Lumens for {BOOST_MINUTES} minutes", boost_minutes=BOOST_MINUTES),
    Drop("xp2x_long", f"2x Lumens for {BOOST_MINUTES * 2} minutes", boost_minutes=BOOST_MINUTES * 2),
    Drop("freeze", "A streak freeze", freezes=1),
)

# Weights, most common first. The long boost is the rare one — a variable reward needs a
# tier a student is pleased to see.
_WEIGHTS = (6, 2, 3)


def _seed(student_id: str, day) -> int:
    """Deterministic per student per day, across processes. sha256 and NOT hash(), which
    Python salts per interpreter run — two workers would disagree about today's chest."""
    raw = f"chest:{student_id}:{day.isoformat()}".encode()
    return int.from_bytes(hashlib.sha256(raw).digest()[:8], "big")


def roll_chest(student_id: str, day) -> Drop:
    """Today's drop for this student. Pure, and identical on every call."""
    total = sum(_WEIGHTS)
    point = _seed(student_id, day) % total
    upto = 0
    for drop, weight in zip(DROPS, _WEIGHTS):
        upto += weight
        if point < upto:
            return drop
    return DROPS[0]


def boost_multiplier(profile: dict, now: datetime) -> float:
    """The student's active earning multiplier — 2.0 while a boost runs, else 1.0.

    An expiry rather than a banked charge: consuming it writes nothing, so concurrent
    submits cannot race over the same charge, and there is no read-modify-write to lose.

    Any malformed value is 1.0. A corrupt stamp must never 500 an earn — the student would
    lose the XP, not just the boost.
    """
    boosts = profile.get("boosts")
    if not isinstance(boosts, dict):
        return 1.0
    try:
        until = datetime.fromisoformat(str(boosts.get("xp2x_until")))
    except (ValueError, TypeError):
        return 1.0
    if until.tzinfo is None or now.tzinfo is None:
        return 1.0
    return 2.0 if now < until else 1.0
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/gamification/test_chest.py -v`
Expected: PASS, 9 passed

> If `test_every_drop_kind_is_reachable_over_a_year` fails, the weights are fine but the seed is not spreading — check `_seed` uses sha256 and mixes the day.

- [ ] **Step 5: Commit**

```bash
git add tools/gamification/chest.py tests/gamification/test_chest.py
git commit -m "feat(home): the daily chest — deterministic drop, expiring boost"
```

---

### Task 5: Compose the boost into the one multiplier site

**Files:**
- Modify: `tools/gamification/league.py:59-73` (`apply_division_bonus`)
- Test: `tests/gamification/test_boost_multiplier.py`

The boost multiplies **at the same single site** as the division bonus, and rounds **once**. Rounding twice (division, then boost) would drift on non-integer multipliers.

- [ ] **Step 1: Write the failing tests**

```python
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
    plain = apply_division_bonus(10, 3)
    assert apply_division_bonus(10, 3, 2.0) == 2 * plain


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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/gamification/test_boost_multiplier.py -v`
Expected: FAIL — `TypeError: apply_division_bonus() takes 2 positional arguments but 3 were given`

- [ ] **Step 3: Modify `apply_division_bonus`**

Replace the body of `apply_division_bonus` in `tools/gamification/league.py` with:

```python
def apply_division_bonus(amount: int, division, boost: float = 1.0) -> int:
    """Scale one EARNING by the earner's division and any active boost. Pure, so the
    economy can be reasoned about without a database.

    Penalties pass through untouched. A forfeit is -30 flat at every tier under every
    boost: running it through the same multiplier would mean the better you do, the more
    one mistake costs you, which is the exact opposite of a reward.

    Both multipliers apply in ONE expression and round ONCE. Rounding after the division
    step and again after the boost drifts by a Lumen on non-integer ladders, and a student
    cannot be told why.

    Rounds half-UP rather than using round(), which is banker's rounding — round(4.5) is 4
    and round(5.5) is 6 — so a 5-Lumen chat award would round differently from a 3-Lumen
    one for reasons no student could be told."""
    a = int(amount)
    if a <= 0:
        return a
    return math.floor(a * division_multiplier(division) * float(boost) + 0.5)
```

- [ ] **Step 4: Run both bonus suites to verify nothing regressed**

Run: `python -m pytest tests/gamification/test_boost_multiplier.py tests/gamification/test_division_bonus.py -v`
Expected: PASS — the new file passes and every existing division-bonus test still passes (the default `boost=1.0` is inert).

- [ ] **Step 5: Commit**

```bash
git add tools/gamification/league.py tests/gamification/test_boost_multiplier.py
git commit -m "feat(home): the boost composes at the one multiplier site, rounding once"
```

---

### Task 6: Wire `update_profile` — the single writer

**Files:**
- Modify: `tools/profile/update_profile.py` (signature, the `gain` line, one new guarded write)
- Test: `tests/profile/test_update_profile_activity.py`

- [ ] **Step 1: Write the failing tests**

```python
"""update_profile as the single writer of the daily activity tally.

It is already the one funnel every Lumen in the app is credited through, which is exactly
why the tally belongs here: one writer means quest progress cannot drift from what the
student actually did. The rules with a test each:
  · An earn with a source records that source.
  · An earn with NO source records nothing (role updates, check-ins).
  · A stale daily_state_date does not carry yesterday's counts into today.
  · An active boost multiplies the XP that lands.
  · A boost never multiplies a penalty.
"""
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from tools.profile.update_profile import update_profile

SGT = timezone(timedelta(hours=8))
TODAY = date(2026, 8, 4)


def _writes(mock_update):
    """Merge every guarded write into one dict — they are dispatched concurrently as
    disjoint column groups, so the test should not care which call carried which field."""
    merged = {}
    for call in mock_update.call_args_list:
        merged.update(call.kwargs)
    return merged


@pytest.mark.asyncio
async def test_an_earn_with_a_source_records_the_activity():
    profile = {"student_id": "ann", "xp": 0, "division": 1}
    with patch("tools.profile.update_profile.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.profile.update_profile.db.update_profile", AsyncMock()) as upd, \
         patch("tools.profile.update_profile.app_today", return_value=TODAY):
        await update_profile("ann", xp_delta=10, source="flashcards", topic="gonioscopy")
    written = _writes(upd)
    assert written["daily_state"]["activity"]["flashcards"] == 1
    assert written["daily_state"]["activity"]["topics"]["gonioscopy"] == 1
    assert written["daily_state_date"] == TODAY.isoformat()


@pytest.mark.asyncio
async def test_no_source_records_no_activity():
    profile = {"student_id": "ann", "xp": 0, "division": 1}
    with patch("tools.profile.update_profile.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.profile.update_profile.db.update_profile", AsyncMock()) as upd, \
         patch("tools.profile.update_profile.app_today", return_value=TODAY):
        await update_profile("ann", xp_delta=10)
    assert "daily_state" not in _writes(upd)


@pytest.mark.asyncio
async def test_a_stale_daily_state_does_not_carry_into_today():
    profile = {"student_id": "ann", "xp": 0, "division": 1,
               "daily_state": {"activity": {"flashcards": 9, "osce": 0, "tutor": 0, "topics": {}},
                               "quests_claimed": [], "chest_claimed": True},
               "daily_state_date": "2026-08-03"}
    with patch("tools.profile.update_profile.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.profile.update_profile.db.update_profile", AsyncMock()) as upd, \
         patch("tools.profile.update_profile.app_today", return_value=TODAY):
        await update_profile("ann", xp_delta=10, source="flashcards")
    written = _writes(upd)
    assert written["daily_state"]["activity"]["flashcards"] == 1   # not 10
    assert written["daily_state"]["chest_claimed"] is False


@pytest.mark.asyncio
async def test_an_active_boost_multiplies_the_xp_that_lands():
    until = (datetime.now(SGT) + timedelta(minutes=10)).isoformat()
    profile = {"student_id": "ann", "xp": 0, "division": 1, "boosts": {"xp2x_until": until}}
    with patch("tools.profile.update_profile.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.profile.update_profile.db.update_profile", AsyncMock()) as upd, \
         patch("tools.profile.update_profile.app_today", return_value=TODAY):
        await update_profile("ann", xp_delta=10, source="flashcards")
    assert _writes(upd)["xp"] == 20


@pytest.mark.asyncio
async def test_a_boost_never_multiplies_a_forfeit():
    until = (datetime.now(SGT) + timedelta(minutes=10)).isoformat()
    profile = {"student_id": "ann", "xp": 100, "division": 1, "boosts": {"xp2x_until": until}}
    with patch("tools.profile.update_profile.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.profile.update_profile.db.update_profile", AsyncMock()) as upd, \
         patch("tools.profile.update_profile.app_today", return_value=TODAY):
        await update_profile("ann", xp_delta=-30, source="flashcards")
    assert _writes(upd)["xp"] == 70   # 100 - 30, not 100 - 60
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/profile/test_update_profile_activity.py -v`
Expected: FAIL — `TypeError: update_profile() got an unexpected keyword argument 'source'`

- [ ] **Step 3: Add the imports**

Add to the imports at the top of `tools/profile/update_profile.py`:

```python
from tools.gamification.chest import boost_multiplier
from tools.gamification.daily_state import read_daily_state, record_activity
from tools.shared.clock import app_now
```

> `app_today` is already imported. Confirm `app_now` exists in `tools/shared/clock.py` — `app_today()` is defined as `app_now().date()`, so it does.

- [ ] **Step 4: Add the `source` parameter**

Change the signature (currently at `tools/profile/update_profile.py:83-92`) — add one parameter after `hearts_used`:

```python
async def update_profile(
    student_id: str,
    topic: str | None = None,
    score: float | None = None,
    new_missed_findings: list[str] | None = None,
    checkin_done: bool = False,
    role: str | None = None,
    xp_delta: int = 0,
    hearts_used: int = 0,
    source: str | None = None,
) -> None:
```

- [ ] **Step 5: Compose the boost into `gain`**

Replace the single `gain = ...` line (currently `tools/profile/update_profile.py:218`):

```python
    # The boost rides the SAME single multiplier site as the division bonus, and rounds
    # once with it. It is an expiry, not a banked charge, so nothing is consumed here —
    # there is no read-modify-write and therefore no race between concurrent submits.
    gain = apply_division_bonus(xp_delta + streak_bonus, profile.get("division"),
                                boost_multiplier(profile, app_now()))
```

- [ ] **Step 6: Add the guarded activity write**

Insert directly **after** the `gain = ...` statement and **before** the `if xp_delta != 0 or hearts_used != 0 ...` block:

```python
    # The daily activity tally — the substrate every Home quest computes from. One writer,
    # so a quest bar can never disagree with what the student actually did. Its own guarded
    # write, so a column still pending migration 018 cannot sink the XP writes beside it.
    if source:
        try:
            state = record_activity(read_daily_state(profile, today), source, topic)
            writes.append(_write(
                "daily_state_write_error", "gamification",
                daily_state=state, daily_state_date=today_iso,
            ))
        except Exception as exc:
            log("daily_state_error", student_id=student_id, feature="gamification", detail=str(exc))
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `python -m pytest tests/profile/test_update_profile_activity.py -v`
Expected: PASS, 5 passed

- [ ] **Step 8: Run the full suite — this file is on every earn path**

Run: `python -m pytest -q`
Expected: PASS, no regressions. `update_profile` is called by flashcards, OSCE, tutor and check-in, so a break here breaks all four.

- [ ] **Step 9: Commit**

```bash
git add tools/profile/update_profile.py tests/profile/test_update_profile_activity.py
git commit -m "feat(home): update_profile becomes the single writer of the daily tally"
```

---

### Task 7: Pass `source` at the four earn sites

**Files:**
- Modify: `tools/api/routers/student.py:547,555` (flashcards), `:574` (forfeit)
- Modify: `tools/api/routers/cases.py:996` (OSCE), `:1339` (OSCE forfeit)
- Modify: `tools/api/routers/chat.py:245` (tutor)

Without this the tally stays empty and every quest reads zero. Each change adds one keyword argument and nothing else.

- [ ] **Step 1: Read each call site before editing**

Run: `python -m pytest tests/api -q` first to confirm a green baseline, then open each of the five call sites listed above and read the surrounding call.

- [ ] **Step 2: Tag the flashcard completion — ONCE per deck, not once per topic**

`flashcards_complete` calls `update_profile` **in a loop, once per topic in the deck**, and already guards the XP award with `i == 0` so a deck pays once. The source needs the **identical guard**, or a deck covering three topics would count as three deck completions and a "clear 2 decks" quest would finish on one.

Replace the block at `tools/api/routers/student.py:543-557`:

```python
    if by_topic:
        for i, (topic, hits) in enumerate(by_topic.items()):
            accuracy = sum(hits) / len(hits)
            try:
                await update_profile(
                    student_id, topic=topic, score=accuracy,
                    xp_delta=xp_delta if i == 0 else 0,
                    # Same i == 0 guard as the XP award, and for the same reason: one
                    # completed deck is ONE completion. Tagging every topic in the deck
                    # would let a three-topic deck clear a three-deck quest.
                    source="flashcards" if i == 0 else None,
                )
            except Exception:
                pass
    elif xp_delta:
        try:
            await update_profile(student_id, xp_delta=xp_delta, source="flashcards")
        except Exception:
            pass
```

- [ ] **Step 3: Tag the OSCE completion**

Replace the call at `tools/api/routers/cases.py:995-998`:

```python
        from tools.profile.update_profile import update_profile
        await update_profile(
            student_id, topic=case["topic"], score=score["score_100"] / 100,
            new_missed_findings=missed, xp_delta=award, source="osce",
        )
```

- [ ] **Step 4: Tag the tutor session**

Replace the call at `tools/api/routers/chat.py:245`:

```python
        await update_profile(student_id, source="tutor")
```

- [ ] **Step 4b: Add the regression test for the one-deck-counts-once rule**

Create `tests/api/test_flashcards_activity_source.py`:

```python
"""A completed deck is ONE completion, however many topics it covers.

flashcards_complete calls update_profile once per topic in the deck. The XP award is
guarded with i == 0 so a deck pays once; the activity source needs the same guard, or a
three-topic deck counts as three deck completions and a "clear 3 decks" quest is cleared
by finishing one.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def test_a_multi_topic_deck_records_exactly_one_flashcard_completion():
    body = {"results": [
        {"card_id": "c1", "correct": True, "topic_tag": "gonioscopy"},
        {"card_id": "c2", "correct": True, "topic_tag": "visual fields"},
        {"card_id": "c3", "correct": False, "topic_tag": "tonometry"},
    ]}
    with patch("tools.api.routers.student.update_profile", AsyncMock()) as upd, \
         patch("tools.api.routers.student.get_profile", AsyncMock(return_value={"xp": 0})):
        client.post("/api/flashcards/complete", json=body,
                    cookies={"eyebot_token": create_access_token("ann", "student", "OA")})
    sourced = [c for c in upd.call_args_list if c.kwargs.get("source") == "flashcards"]
    assert len(sourced) == 1
```

> If `/api/flashcards/complete` rejects this body, open the `FlashcardCheckRequest` /
> `FlashcardCompleteRequest` model in `tools/api/routers/student.py` and match its exact
> field names — the assertion is what matters, not the payload shape.

- [ ] **Step 5: Leave BOTH forfeit calls without a source**

`tools/api/routers/student.py:574` and `tools/api/routers/cases.py:1339` stay untouched. A forfeit is a quit, not a completion — counting it toward a quest would let a student clear "Run 1 OSCE station" by starting and quitting one.

- [ ] **Step 6: Run the suite**

Run: `python -m pytest -q`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add tools/api/routers/student.py tools/api/routers/cases.py tools/api/routers/chat.py tests/api/test_flashcards_activity_source.py
git commit -m "feat(home): name the source on every earn, so quests can see the work"
```

---

### Task 8: `GET /api/home` and the two claim endpoints

**Files:**
- Create: `tools/api/routers/home.py`
- Modify: `tools/api/server.py:46-53` (import), `:195-202` (register)
- Test: `tests/api/test_home_endpoints.py`

- [ ] **Step 1: Write the failing tests**

```python
"""The Home payload and the two claims.

The pure mechanics are tested in tests/gamification/. What is only testable here is the
WIRING — and above all the repeat case. Idempotent-claim and show-once-per-day invariants
are a class of bug this project has shipped before, so claiming twice has a test on both
endpoints and both assert the SECOND call awards nothing.
"""
from datetime import date
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)
TODAY = date(2026, 8, 4)


def _cookies(sub: str = "ann") -> dict:
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


def _profile(**extra) -> dict:
    return {"student_id": "ann", "xp": 250, "division": 1, "weak_topics": ["gonioscopy"],
            "xp_today": 40, "xp_today_date": TODAY.isoformat(), **extra}


def test_home_requires_auth():
    assert client.get("/api/home").status_code == 401


def test_home_returns_three_quests_with_progress():
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=_profile())), \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        r = client.get("/api/home", cookies=_cookies())
    assert r.status_code == 200
    body = r.json()
    assert len(body["quests"]) == 3
    assert sorted(q["kind"] for q in body["quests"]) == ["adaptive", "breadth", "stretch"]
    stretch = next(q for q in body["quests"] if q["kind"] == "stretch")
    assert stretch["progress"] == 40          # from xp_today, merged into the activity dict


def test_home_reports_a_failed_read_as_null_never_zero():
    # The one screen a student opens to see their work must not paint 0 XP as fact.
    with patch("tools.api.routers.home.get_profile", AsyncMock(side_effect=RuntimeError("down"))):
        r = client.get("/api/home", cookies=_cookies())
    assert r.status_code == 200
    assert r.json()["quests"] is None
    assert r.json()["chest"] is None


def test_home_shows_the_chest_unclaimed_then_claimed():
    claimed = {"activity": {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}},
               "quests_claimed": [], "chest_claimed": True}
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=_profile())), \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        assert client.get("/api/home", cookies=_cookies()).json()["chest"]["claimed"] is False
    with patch("tools.api.routers.home.get_profile",
               AsyncMock(return_value=_profile(daily_state=claimed,
                                               daily_state_date=TODAY.isoformat()))), \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        assert client.get("/api/home", cookies=_cookies()).json()["chest"]["claimed"] is True


def test_claiming_the_chest_twice_pays_once_and_pays_the_same_drop():
    profile = _profile()
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.api.routers.home.db.update_profile", AsyncMock()) as upd, \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        first = client.post("/api/home/chest/claim", cookies=_cookies()).json()
    assert first["ok"] is True
    writes_after_first = upd.call_count

    already = {"activity": {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}},
               "quests_claimed": [], "chest_claimed": True}
    with patch("tools.api.routers.home.get_profile",
               AsyncMock(return_value=_profile(daily_state=already,
                                               daily_state_date=TODAY.isoformat()))), \
         patch("tools.api.routers.home.db.update_profile", AsyncMock()) as upd2, \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        second = client.post("/api/home/chest/claim", cookies=_cookies()).json()

    assert second["already_claimed"] is True
    assert second["drop"]["key"] == first["drop"]["key"]   # same prize, always
    assert upd2.call_count == 0                            # and nothing was awarded again
    assert writes_after_first > 0


def test_claiming_an_incomplete_quest_pays_nothing():
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=_profile())), \
         patch("tools.api.routers.home.update_profile", AsyncMock()) as award, \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        r = client.post("/api/home/quest/claim", json={"kind": "breadth"}, cookies=_cookies())
    assert r.json()["ok"] is False
    assert award.call_count == 0


def test_claiming_a_completed_quest_twice_pays_once():
    # xp_today=999 clears the stretch quest, whose metric is xp — no activity needed.
    done = {"activity": {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}},
            "quests_claimed": [], "chest_claimed": False}
    profile = _profile(xp_today=999, daily_state=done, daily_state_date=TODAY.isoformat())
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.api.routers.home.db.update_profile", AsyncMock()), \
         patch("tools.api.routers.home.update_profile", AsyncMock()) as award, \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        first = client.post("/api/home/quest/claim", json={"kind": "stretch"}, cookies=_cookies())
    assert first.json()["ok"] is True
    assert award.call_count == 1

    already = dict(done, quests_claimed=["stretch"])
    with patch("tools.api.routers.home.get_profile",
               AsyncMock(return_value=_profile(xp_today=999, daily_state=already,
                                               daily_state_date=TODAY.isoformat()))), \
         patch("tools.api.routers.home.db.update_profile", AsyncMock()), \
         patch("tools.api.routers.home.update_profile", AsyncMock()) as award2, \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        second = client.post("/api/home/quest/claim", json={"kind": "stretch"}, cookies=_cookies())
    assert second.json()["already_claimed"] is True
    assert award2.call_count == 0


def test_a_claim_never_trusts_the_body_for_identity():
    # Identity is the JWT sub. A body field naming another student must not be honoured.
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=_profile())) as gp, \
         patch("tools.api.routers.home.db.update_profile", AsyncMock()), \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        client.post("/api/home/chest/claim", json={"student_id": "victim"}, cookies=_cookies("ann"))
    assert gp.call_args.args[0] == "ann"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/api/test_home_endpoints.py -v`
Expected: FAIL — 404 on every route (the router does not exist yet).

- [ ] **Step 3: Write the router**

```python
"""The Home game loop — one payload, and the two claims.

ONE endpoint on purpose. Prod is a single uvicorn worker on Render free, so a Home that
fanned out to progress + leaderboard + suggestion would cost three round-trips on the one
worker. It also gives the screen a single honest error state instead of three independent
partial failures.
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from tools.api.shared import limiter
from tools.gamification.chest import BOOST_MINUTES, boost_multiplier, roll_chest
from tools.gamification.daily_state import read_daily_state
from tools.gamification.quests import daily_quests, is_complete, quest_progress
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.progress.get_progress import DAILY_XP_GOAL
from tools.shared import db
from tools.shared.clock import app_now, app_today
from tools.shared.jwt_utils import CurrentUser, get_current_user
from tools.shared.logging_config import log

router = APIRouter()


class QuestClaim(BaseModel):
    kind: str


def _activity_for_quests(state: dict, profile: dict, today) -> dict:
    """The activity dict quests read. `xp` is NOT in daily_state — it already lives in the
    xp_today column, and duplicating it would be two counters that can disagree."""
    stamp = str(profile.get("xp_today_date") or "")
    xp_today = int(profile.get("xp_today") or 0) if stamp == today.isoformat() else 0
    return {**state["activity"], "xp": xp_today}


def _quest_payload(profile: dict, student_id: str, today) -> tuple[list[dict], dict]:
    state = read_daily_state(profile, today)
    activity = _activity_for_quests(state, profile, today)
    quests = daily_quests(student_id, today, list(profile.get("weak_topics") or []),
                          str(profile.get("role") or "OA"), DAILY_XP_GOAL)
    rows = [{
        "kind": q.kind, "title": q.title, "target": q.target, "reward_xp": q.reward_xp,
        "progress": min(quest_progress(q, activity), q.target),
        "complete": is_complete(q, activity),
        "claimed": q.kind in state["quests_claimed"],
    } for q in quests]
    return rows, state


@router.get("/api/home")
@limiter.limit("60/minute")
async def home(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """Everything the Home HUD needs, in one read.

    A failed read returns nulls, never zeros: the one screen a student opens to see their
    work must not report "no quests, no streak" as fact when it simply could not load."""
    student_id = current_user["sub"]
    today = app_today()
    try:
        profile = await get_profile(student_id) or {}
    except Exception as exc:
        log("home_read_error", student_id=student_id, feature="home", detail=str(exc))
        return {"quests": None, "chest": None, "boost": None}

    rows, state = _quest_payload(profile, student_id, today)
    drop = roll_chest(student_id, today)
    mult = boost_multiplier(profile, app_now())
    boosts = profile.get("boosts") if isinstance(profile.get("boosts"), dict) else {}

    return {
        "quests": rows,
        "chest": {"claimed": state["chest_claimed"], "key": drop.key, "label": drop.label},
        "boost": {"multiplier": mult, "until": boosts.get("xp2x_until") if mult > 1.0 else None},
    }


@router.post("/api/home/chest/claim")
@limiter.limit("30/minute")
async def claim_chest(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """Claim today's chest. Idempotent by construction: the drop is a pure function of
    (student_id, date), so a repeat claim cannot pay a different prize even if the first
    claim's write failed. Identity is the JWT sub — never the body."""
    student_id = current_user["sub"]
    today = app_today()
    try:
        profile = await get_profile(student_id) or {}
    except Exception:
        return {"ok": False, "already_claimed": False, "drop": None}

    drop = roll_chest(student_id, today)
    state = read_daily_state(profile, today)
    payload = {"key": drop.key, "label": drop.label}
    if state["chest_claimed"]:
        return {"ok": True, "already_claimed": True, "drop": payload}

    fields = {"daily_state": {**state, "chest_claimed": True},
              "daily_state_date": today.isoformat()}
    if drop.boost_minutes:
        boosts = dict(profile.get("boosts") or {}) if isinstance(profile.get("boosts"), dict) else {}
        boosts["xp2x_until"] = (app_now() + timedelta(minutes=drop.boost_minutes)).isoformat()
        fields["boosts"] = boosts
    if drop.freezes:
        fields["streak_freezes"] = int(profile.get("streak_freezes") or 0) + drop.freezes

    try:
        await db.update_profile(student_id, **fields)
    except Exception as exc:
        log("chest_claim_error", student_id=student_id, feature="home", detail=str(exc))
        return {"ok": False, "already_claimed": False, "drop": payload}
    return {"ok": True, "already_claimed": False, "drop": payload}


@router.post("/api/home/quest/claim")
@limiter.limit("30/minute")
async def claim_quest(request: Request, body: QuestClaim,
                      current_user: CurrentUser = Depends(get_current_user)):
    """Claim a completed quest's XP. Identity is the JWT sub — never the body, which
    carries only which quest. Quests pay XP rather than boosts because a quest cannot be
    completed without studying, so the payout can never buy League rank."""
    student_id = current_user["sub"]
    today = app_today()
    try:
        profile = await get_profile(student_id) or {}
    except Exception:
        return {"ok": False, "already_claimed": False}

    rows, state = _quest_payload(profile, student_id, today)
    row = next((r for r in rows if r["kind"] == body.kind), None)
    if row is None or not row["complete"]:
        return {"ok": False, "already_claimed": False}
    if row["claimed"]:
        return {"ok": True, "already_claimed": True}

    # Mark claimed FIRST. If the award then fails the student can retry; the reverse order
    # would let a retry pay twice, and double-paying the League is the worse failure.
    try:
        await db.update_profile(
            student_id,
            daily_state={**state, "quests_claimed": [*state["quests_claimed"], body.kind]},
            daily_state_date=today.isoformat(),
        )
    except Exception as exc:
        log("quest_claim_error", student_id=student_id, feature="home", detail=str(exc))
        return {"ok": False, "already_claimed": False}

    await update_profile(student_id, xp_delta=row["reward_xp"])
    return {"ok": True, "already_claimed": False, "reward_xp": row["reward_xp"]}
```

- [ ] **Step 4: Register the router**

In `tools/api/server.py`, add the import beside the others (near line 53):

```python
from tools.api.routers.home import router as home_router
```

and register it beside the others (near line 202):

```python
app.include_router(home_router)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python -m pytest tests/api/test_home_endpoints.py -v`
Expected: PASS, 8 passed

- [ ] **Step 6: Commit**

```bash
git add tools/api/routers/home.py tools/api/server.py tests/api/test_home_endpoints.py
git commit -m "feat(home): GET /api/home plus two claims that cannot pay twice"
```

---

### Task 9: League standing in the payload — the STAKES

**Files:**
- Modify: `tools/api/routers/home.py` (imports + one helper + one payload key)
- Test: `tests/api/test_home_league_standing.py`

This is the fourth gap: nothing social is live on Home. It answers *where am I, and what would it take to climb one rung* — the number that makes a student open a deck instead of closing the tab.

> **Two traps.** (1) `/api/leaderboard` rides two once-per-period background jobs on its traffic (the Monday rollover, the daily rank snapshot) because the app has no cron. Home must trigger **neither** — they are seal-guarded and correct, but adding a second trigger point changes *when the league's week closes*, which is not this feature's call to make. Home is read-only. (2) This costs two full-table reads on the single Render worker, so it is best-effort: any failure returns `null` and the HUD simply omits the strip.

- [ ] **Step 1: Write the failing tests**

```python
"""The league strip on Home — read-only, and never a blocker.

Home must not run the league's background jobs: /api/leaderboard owns the Monday rollover
and the daily rank snapshot, both seal-guarded, and a second trigger point would move when
a week closes. It also must not 500 or hang the whole payload when the board is unavailable
— a student's quests do not depend on knowing their rank.
"""
from datetime import date
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)
TODAY = date(2026, 8, 4)
WEEK = date(2026, 8, 3)   # the Monday of TODAY's week


def _cookies(sub: str = "ann") -> dict:
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


def _p(sid: str, xp_week: int) -> dict:
    return {"student_id": sid, "role": "OA", "division": 1, "xp": xp_week * 10,
            "xp_week": xp_week, "xp_week_start": WEEK.isoformat()}


BOARD = [_p("top", 500), _p("second", 400), _p("third", 300), _p("ann", 100), _p("last", 50)]
CONSENT = [{"student_id": p["student_id"], "student_name": p["student_id"].title()} for p in BOARD]


def _patched(**over):
    profile = {"student_id": "ann", "division": 1, "xp_week": 100,
               "xp_week_start": WEEK.isoformat(), "weak_topics": [], **over}
    return (
        patch("tools.api.routers.home.get_profile", AsyncMock(return_value=profile)),
        patch("tools.api.routers.home.db.get_active_leaderboard_profiles",
              AsyncMock(return_value=BOARD)),
        patch("tools.api.routers.home.db.get_all_consent", AsyncMock(return_value=CONSENT)),
        patch("tools.api.routers.home.app_today", return_value=TODAY),
        patch("tools.api.routers.home.app_week_start", return_value=WEEK),
    )


def test_the_strip_reports_rank_and_the_promotion_cut():
    a, b, c, d, e = _patched()
    with a, b, c, d, e:
        league = client.get("/api/home", cookies=_cookies()).json()["league"]
    assert league["rank"] == 4               # 500, 400, 300, then ann on 100
    assert league["pool_size"] == 5
    assert league["promote_count"] == 3      # the podium IS the cut


def test_the_strip_says_what_it_costs_to_reach_the_cut():
    a, b, c, d, e = _patched()
    with a, b, c, d, e:
        league = client.get("/api/home", cookies=_cookies()).json()["league"]
    # ann has 100; the last promoting rung (3rd) has 300.
    assert league["xp_to_promotion"] == 200


def test_a_student_already_inside_the_cut_needs_nothing():
    a, b, c, d, e = _patched(xp_week=450)
    with a, b, c, d, e:
        league = client.get("/api/home", cookies=_cookies("top")).json()["league"]
    assert league["xp_to_promotion"] == 0


def test_an_unavailable_board_is_null_and_never_breaks_the_payload():
    with patch("tools.api.routers.home.get_profile",
               AsyncMock(return_value={"student_id": "ann", "weak_topics": []})), \
         patch("tools.api.routers.home.db.get_active_leaderboard_profiles",
               AsyncMock(side_effect=RuntimeError("board down"))), \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        body = client.get("/api/home", cookies=_cookies()).json()
    assert body["league"] is None
    assert len(body["quests"]) == 3      # the rest of the payload is unaffected


def test_home_never_runs_the_league_background_jobs():
    # take_seal is the gate both jobs pass through. If Home ever calls it, Home has become
    # a second place the league's week can close, which is exactly what must not happen.
    a, b, c, d, e = _patched()
    with a, b, c, d, e, \
         patch("tools.api.routers.home.db.take_seal", AsyncMock(return_value=True)) as seal:
        client.get("/api/home", cookies=_cookies())
    assert seal.call_count == 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/api/test_home_league_standing.py -v`
Expected: FAIL — `KeyError: 'league'` (the payload has no such key yet).

- [ ] **Step 3: Add the imports to `tools/api/routers/home.py`**

```python
from tools.gamification.league import TOP_DIVISION, division_name, promote_count
from tools.gamification.leaderboard import rank_entries, would_be_rank_for
from tools.shared.clock import app_now, app_today, app_week_start
```

> Replace the existing `from tools.shared.clock import app_now, app_today` line — do not add a second import of the same module.

- [ ] **Step 4: Add the helper**

```python
async def _league_standing(student_id: str, profile: dict) -> dict | None:
    """The viewer's rung and what it would take to climb one.

    READ-ONLY, deliberately. /api/leaderboard rides two once-per-period background jobs on
    its traffic (the Monday rollover, the daily rank snapshot) because this app has no
    cron. Home triggers NEITHER: they are seal-guarded and correct, but a second trigger
    point changes when the league's week closes, and that is not this feature's call.

    Best-effort. Two full-table reads on a single worker is real cost, so every failure is
    a None the HUD simply omits — a student's quests do not depend on knowing their rank.
    """
    try:
        profiles = await db.get_active_leaderboard_profiles()
        consent = await db.get_all_consent()
    except Exception:
        return None
    if not profiles:
        return None

    names = {r["student_id"]: (r.get("student_name") or "") for r in consent}
    # Same two migration probes the board uses: pre-012 there is no weekly column and
    # pre-016 no division, and in both cases the ladder degrades rather than breaking.
    week_start = app_week_start() if any("xp_week_start" in p for p in profiles) else None
    my_division = int(profile.get("division") or 1) if any("division" in p for p in profiles) else None

    entries = rank_entries(profiles, names, viewer_id=student_id, today=app_today(),
                           week_start=week_start, division=my_division)
    mine = next((e for e in entries if e.get("student_id") == student_id), None)
    # A hidden student is dropped from the ladder for everyone including themselves, so
    # their standing has to be answered separately — same as the board does.
    rank = mine["rank"] if mine else would_be_rank_for(entries, profile, names, week_start)

    # The pool comes from the profiles, not from `entries` — the same rule the board
    # follows, so Home and the board can never draw the promotion line in different places.
    pool = [p for p in profiles
            if not p.get("leaderboard_hidden")
            and (my_division is None or int(p.get("division") or 1) == my_division)]
    cut = 0 if (my_division or 1) >= TOP_DIVISION else promote_count(len(pool))

    # The XP standing between them and the last promoting rung. Zero once they are on it —
    # never a negative, which would render as a nonsense "-120 XP to go".
    gap = 0
    if cut and rank > cut and len(entries) >= cut:
        gap = max(0, int(entries[cut - 1].get("xp") or 0) - int((mine or {}).get("xp") or 0))

    return {"rank": rank, "pool_size": len(pool), "promote_count": cut,
            "division_name": division_name(my_division or 1), "xp_to_promotion": gap}
```

- [ ] **Step 5: Add it to the payload**

In `home()`, replace the `return` with:

```python
    return {
        "quests": rows,
        "chest": {"claimed": state["chest_claimed"], "key": drop.key, "label": drop.label},
        "boost": {"multiplier": mult, "until": boosts.get("xp2x_until") if mult > 1.0 else None},
        "league": await _league_standing(student_id, profile),
    }
```

And add `"league": None` to the early-return in the `except` branch of `home()`, so a failed profile read still returns every key the HUD expects:

```python
        return {"quests": None, "chest": None, "boost": None, "league": None}
```

- [ ] **Step 5b: Stop Task 8's tests from reaching the real database**

`GET /api/home` now performs two board reads, and Task 8's tests do not patch them — this suite talks to the **production** Supabase, so an unpatched read is a live prod call from the test suite. Add this autouse fixture at the top of `tests/api/test_home_endpoints.py`, directly below the `client = TestClient(app)` line:

```python
import pytest


@pytest.fixture(autouse=True)
def _no_board_reads():
    """Home reads the league board. Those reads are not what this file tests, and an
    unpatched one would hit the real database — an empty board makes the strip None."""
    with patch("tools.api.routers.home.db.get_active_leaderboard_profiles",
               AsyncMock(return_value=[])), \
         patch("tools.api.routers.home.db.get_all_consent", AsyncMock(return_value=[])):
        yield
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `python -m pytest tests/api/test_home_league_standing.py tests/api/test_home_endpoints.py -v`
Expected: PASS — 5 new, and the 8 from Task 8 still green.

- [ ] **Step 7: Commit**

```bash
git add tools/api/routers/home.py tests/api/test_home_league_standing.py
git commit -m "feat(home): put the rung and the climb on the payload, read-only"
```

---

### Task 10: Gates, migration, ship

**Files:** none — verification only.

- [ ] **Step 1: Full backend suite**

Run: `python -m pytest -q`
Expected: PASS. `MOCK_MODE` engages automatically with no `GEMINI_API_KEY`, so no live AI call is made.

- [ ] **Step 2: Frontend gates (nothing changed, but CI runs them)**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS. Phase 1 touches no frontend file; this only proves the push will not land red.

- [ ] **Step 3: Apply migration 018**

Use the `/db-migrate` command. Paste the **SQL contents** of `tools/db/migrations/018_home_game_loop.sql` into the Supabase SQL editor — never the file path. Then flip its `APPLIED.md` line to `- [x]` with the date.

> Ordering is safe either way here: every read tolerates the absent columns, so the code may ship before or after the migration. Applying it after the code is green means the mechanics light up rather than sit dark.

- [ ] **Step 4: Verify the columns exist**

In the Supabase SQL editor:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'student_profiles'
  AND column_name IN ('daily_state', 'daily_state_date', 'boosts');
```
Expected: 3 rows.

- [ ] **Step 5: Commit the applied ledger and push**

```bash
git add tools/db/migrations/APPLIED.md
git commit -m "chore(db): record migration 018 as applied"
git fetch origin main
git rev-list --left-right --count origin/main...HEAD
```

Confirm the branch is **fast-forward** (left count `0`) before pushing — multiple sessions push to this repo and `main` has been force-pushed before. If it is not fast-forward, stop and resolve the divergence rather than force-pushing.

```bash
git push origin main
```

- [ ] **Step 6: Confirm CI is green — a push is not done until CI says so**

```bash
gh run list --branch main --limit 1
```

Then read the **jobs**, not just the run conclusion (`cancelled` is not a pass):

```bash
gh run view <run-id> --json jobs -q '.jobs[] | "\(.conclusion)  \(.name)"'
```
Expected: `success` for Backend (pytest, Python 3.12), Frontend (typecheck + build), and Supply-chain audit.

- [ ] **Step 7: Behavioral verify against the running app**

With the API running (`uvicorn tools.api.server:app --reload --port 8000`) and a logged-in session cookie, confirm the loop end-to-end:

1. `GET /api/home` → three quests, `chest.claimed: false`, `boost.multiplier: 1.0`, and a `league` strip with a plausible `rank` / `promote_count`.
2. `POST /api/home/chest/claim` → a drop.
3. `POST /api/home/chest/claim` **again** → `already_claimed: true` and the **same** `drop.key`.
4. `GET /api/home` → `chest.claimed: true`; if the drop was a boost, `boost.multiplier: 2.0` with an `until` stamp.
5. Complete one flashcard deck, then `GET /api/home` → the matching quest's `progress` moved by exactly **1**, not by the number of topics the deck covered.
6. Open `/leaderboard` and confirm its `rank` and promotion line **agree with** the `league` strip from step 1. They derive the pool the same way; if they disagree, one of them is drawing the cut in the wrong place.

Step 3 is the one that matters most. A state invariant like this needs both a regression test *and* a real behavioral check on the running app — a passing test on a path the app does not actually take proves nothing.

---

## Definition of done

- [ ] `python -m pytest -q` green
- [ ] `npm run typecheck && npm run build` green
- [ ] Migration 018 applied and ledgered in `APPLIED.md`
- [ ] CI green on `main` — **jobs** read individually, not just the run conclusion
- [ ] Claiming the chest twice pays once, verified on the running app, not only in tests
- [ ] Zero visual change to the Home — Phase 1 is invisible by design
- [ ] The League is unaffected in **both** directions: no path pays XP for anything but real study, and Home never triggers the rollover or rank-snapshot jobs
- [ ] All four gaps are served at the data layer — PULL (quests), PAYOFF (chest + boost), STAKES (league strip). LOOK is Phase 2.
