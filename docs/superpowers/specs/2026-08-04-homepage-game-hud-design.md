# Homepage → game HUD — design

**Date:** 2026-08-04
**Status:** approved, not yet implemented
**Supersedes:** nothing yet. Phase 2 will name its criterion changes against
`docs/design-locks.md` § *Home / Dashboard — LOCKED 2026-07-01*.

## Problem

The Home is a **scoreboard**: every element reports what the student already
earned — level chip, XP bar, streak numeral, month calendar, badge vault. It is
entirely past-tense. Nothing on it says *what you could win in the next five
minutes*, and nothing makes leaving feel expensive.

Four gaps, all confirmed by the user:

1. **PULL** — no quest, no urgency. The daily-goal ring was deleted outright by
   the 2026-07-29 lock amendment (criterion d), so Home no longer shows a target
   at all.
2. **PAYOFF** — opening Home pays nothing. Games pay you for showing up.
3. **LOOK** — Home is warm cream wellness while The League next door is dark
   STRUCK arcade. Home reads as the calm menu screen *before* the game.
4. **STAKES** — nothing social is live. Rank lives one route away.

## Scope: two phases

Backend fully working first, then the frontend (standing user rule).

- **Phase 1 — "The Loop"** (this spec): quests, daily chest, boosts, and one
  Home payload. Backend-only. Additive, invisible, safe to ship alone.
- **Phase 2 — "The HUD"** (its own spec, written after Phase 1 is green):
  supersede the cream bento with an arcade game-HUD wired to Phase 1.

Phase 1 covers PULL, PAYOFF and STAKES at the data layer. LOOK is entirely
Phase 2.

## Decisions taken

| Fork | Decision | Why |
|---|---|---|
| Loot payout | **Boosts you must spend** | Rank-honest: a boost only becomes XP if you actually study. Raw XP would inflate `xp_week` and let a student climb The League by opening the app. |
| Hearts | **Leave dormant** | `hearts` is wired but unused. Locking a student out of revision before an assessment is indefensible for clinical training. Loss-aversion comes from the streak timer instead. |
| Quests | **Mixed set of 3** | One of each kind, every day: **adaptive** (*"Clear 8 cards in Gonioscopy"* — your weakest topic), **breadth** (*"Run 1 OSCE station"* — a feature untouched in the activity tally), **stretch** (*"Earn 120 XP today"* — scaled off `daily_goal`). Exactly one of each, so the set is never three of the same shape. |
| Chest roll | **Deterministic per `(student_id, date)`** | Feels variable across days; cannot be re-rolled. Makes the idempotent claim correct *by construction*. |
| Boost duration | **Time-boxed, not count-boxed** | A banked charge needs a read-modify-write per earn (race). An expiry timestamp is a pure function of profile + clock — and a countdown pulls harder than a stored charge. |

## Architecture — one writer, pure readers

The load-bearing fact, verified in the codebase: **`update_profile()` is the
single funnel through which every Lumen in the app is credited.** Its own
comment says so, and the call sites confirm it — flashcards
(`tools/api/routers/student.py:547,555`), flashcard forfeit (`:574`), OSCE
(`tools/api/routers/cases.py:996`), OSCE forfeit (`:1339`), tutor
(`tools/api/routers/chat.py:245`), check-in (`tools/api/routers/checkin.py:138`).

So the whole mechanic set is built as **one writer and pure readers**:

- `update_profile` gains a `source` argument and maintains a daily activity
  tally. One writer.
- **Quests are a pure function** of `(student_id, date, weak_topics, role)` —
  deterministic, never stored.
- **Quest progress is a pure function** of the activity tally — never
  separately advanced, so it cannot drift from reality.
- **The chest drop is a pure function** of `(student_id, date)`.
- **The boost multiplier is a pure function** of `(profile, now)`.
- Only *claims* are persisted.

This mirrors the existing `_day_state` discipline in
`tools/gamification/streak.py`, where `current_week_states` and
`current_month_states` share one helper specifically so the two cannot drift.

### Storage — 3 nullable columns (migration 018)

Mirrors the existing `xp_today` / `xp_today_date` daily-reset pattern rather
than inventing a new one.

| Column | Type | Holds |
|---|---|---|
| `daily_state` | `jsonb` | `{"activity": {"flashcards": 12, "osce": 1, "tutor": 3, "topics": {"glaucoma": 8}}, "quests_claimed": ["q1"], "chest_claimed": true}` |
| `daily_state_date` | `date` | the SGT day it belongs to. A stale or absent stamp reads as empty — no reset job, same trick `xp_week_start` uses. |
| `boosts` | `jsonb` | durable, survives the day: `{"xp2x_until": "2026-08-04T14:22:00+08:00"}` |

Streak-freeze drops increment the **existing** `streak_freezes` column — that
mechanic already works end to end through `streak_engine.advance_streak`.

All three columns are nullable and every read tolerates their absence, matching
how `coins_earned` and `xp_week` shipped. New writes go through the existing
`_write` helper inside the `asyncio.gather`, so a column still pending its
migration can never sink the other writes.

### The boost multiplier

`update_profile` already has exactly one multiplier site:

```python
gain = apply_division_bonus(xp_delta + streak_bonus, profile.get("division"))
```

The boost composes **at that same single site**, and obeys the same rule
`apply_division_bonus` already obeys: **positive deltas only — penalties never
scale.** A forfeit stays −30 flat at every tier and under every boost.

Because the boost is an expiry timestamp, consuming it writes nothing. There is
no read-modify-write and therefore no race between concurrent submits.

### Endpoints — all additive

Nothing is removed; `/api/progress` keeps working untouched so Phase 1 cannot
break the current Home.

- **`GET /api/home`** — one payload: progress + the three quests with live
  progress + chest state + active boost + league standing. One payload because
  prod is a single uvicorn worker on Render free; Home fanning out to three
  calls costs three round-trips on the one worker. It also gives Phase 2 a
  single honest error state instead of three independent partial failures.
- **`POST /api/home/chest/claim`** — idempotent. A second call the same day
  returns the *same* drop.
- **`POST /api/home/quest/claim`** — idempotent per quest per day.

Both claim endpoints ride the shared `limiter` and take identity from the JWT
`sub` only, never the body.

League standing reuses the existing `rank_entries` / `would_be_rank` helpers in
`tools/gamification/leaderboard.py`. The adaptive quest reuses the existing
`weak_topics` (already on the progress payload) and `/api/study-suggestion`.

## Components

Each is independently testable with no DB and no AI.

| Unit | Signature | Depends on |
|---|---|---|
| `tools/gamification/quests.py` | `daily_quests(student_id, date, weak_topics, role) -> list[Quest]` | nothing (pure) |
| | `quest_progress(quest, activity) -> int` | nothing (pure) |
| `tools/gamification/chest.py` | `roll_chest(student_id, date) -> Drop` | nothing (pure) |
| | `boost_multiplier(profile, now) -> int` | nothing (pure) |
| `tools/gamification/daily_state.py` | `read_daily_state(profile, today) -> dict` | nothing (pure) |
| | `record_activity(state, source, topic) -> dict` | nothing (pure) |
| `tools/api/routers/home.py` | the three endpoints | the four modules above + `db` |

`update_profile` gains one `source: str | None = None` argument and one guarded
write. That is its entire diff.

## Data flow

```
student finishes a flashcard deck
  → student.py calls update_profile(xp_delta=N, source="flashcards", topic=T)
      → gain = boost × division × (xp_delta + streak_bonus)      [positive only]
      → existing writes: xp / xp_today / xp_week / coins_earned
      → NEW guarded write: daily_state.activity.flashcards += 1, .topics[T] += 1

student opens Home
  → GET /api/home reads the profile ONCE
      → quests   = daily_quests(sub, today, weak_topics, role)     pure
      → progress = quest_progress(q, state.activity) for each      pure
      → chest    = roll_chest(sub, today) + claimed flag           pure
      → boost    = boost_multiplier(profile, now) + remaining      pure
      → league   = would_be_rank(...)                              existing
```

## Error handling

- `update_profile` keeps its **never-raises** contract. The new write is one
  more `_write(...)` in the existing `asyncio.gather`, individually guarded and
  logged to the audit log on failure.
- A failed activity write loses one quest tick. It never loses XP — the XP
  writes are separate columns in the same gather and are unaffected.
- `GET /api/home` returns partial data with an explicit per-section `null`
  rather than zeros. The existing rule holds: **a failed read must never render
  as `0`** — Home painting "Level 1 · 0 XP" as fact is a bug the codebase has
  already been burned by and explicitly guards against in `Dashboard.tsx`.
- Pre-migration (018 not yet applied): every new column reads as absent, so
  quests show zero progress, the chest is unclaimable and the boost is 1×. The
  app is fully functional; the mechanics are simply dark. This matches how 016
  shipped.

## Testing

TDD, failing test first. Every mechanic is a pure function, so the suite runs
with **zero DB writes** — which matters because this project's tests hit the
production database.

- `tests/gamification/test_quests.py` — determinism (same seed → same set),
  the mixed 1-adaptive/1-breadth/1-stretch shape, role scoping, progress
  computed from an activity dict, completion boundaries.
- `tests/gamification/test_chest.py` — determinism per `(student_id, date)`,
  drop distribution across a year of dates, `boost_multiplier` before/at/after
  expiry, and that a **penalty is never scaled** by an active boost. That last
  case mirrors the existing `tests/gamification/test_division_bonus.py`, which
  pins the same rule for the multiplier the boost composes with — the two must
  agree, since they now stack at one site.
- `tests/gamification/test_daily_state.py` — a stale `daily_state_date` reads
  as empty; `record_activity` accumulates; unknown sources are ignored.
- `tests/api/test_home_endpoints.py` — auth required; **the repeat-claim case
  for both claim endpoints** (claim twice → same drop, awarded once); a
  progress-read failure yields `null`, never `0`.

The repeat-claim tests are mandatory, not optional: show-once-per-day and
idempotent-submit invariants are a class of bug this project has shipped
before, and the standing rule is that such an invariant needs a regression test
covering the repeat case.

## Out of scope for Phase 1

- Every visual change. Home renders exactly as it does today.
- The arcade re-skin, quest board, chest-open animation, streak-at-risk
  countdown — all Phase 2.
- Hearts. The column stays dormant.
- Spending boosts on anything other than the XP multiplier.

## Phase 2 sketch (not this spec)

Supersede the cream bento with an arcade game-HUD in The League's STRUCK
material language: quest board with claimable rows, a chest that opens, a live
rank strip, an at-risk streak countdown, count-up numerals on arrival. It will
name each superseded criterion from the Home lock explicitly, and must preserve
the standing acceptance bar: WCAG-AA on every surface, 390px-safe with 0px
horizontal overflow, all motion frozen under `prefers-reduced-motion` /
`data-motion=reduce`, and the aurora harness green on a prod build.
