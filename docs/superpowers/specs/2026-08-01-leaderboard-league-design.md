# Leaderboard → "The League" — design spec

**Date**: 2026-08-01
**Status**: approved direction, pending implementation plan
**Supersedes**: `Leaderboard "vibrant & seamless" — LOCKED 2026-07-13` in `docs/design-locks.md`,
including its *Out of scope: promotion/relegation leagues, weekly history, rank-movement arrows*.

---

## 1. Why

The current board was audited against world-class game ladders and fails on structure, not
polish. The findings that drive this rebuild:

1. **Nothing is at stake below rank 3.** The only meaningful boundary is 3→4. At rank 12,
   ranks 11 and 13 are mechanically and visually identical.
2. **No time axis.** No rank deltas, no history. The board cannot answer "am I climbing?".
3. **The chase hook is buried** — the single most motivating fact on the page is 16px body
   text under a 68px wordmark that carries no information.
4. **Half the rivalry math is discarded.** `computeRivals` returns `{above, below}`; only
   `.above` is ever read, so nobody chasing you is shown.
5. **Tiers are invisible.** A real Bronze→Diamond ladder exists in `tiers.ts` and renders as
   a 4px bar and a ring colour.
6. **Three unrelated art languages** — baroque AI-generated podium rasters, flat ivory pills,
   an arcade wordmark on an obsidian bar. The three podium `.webp`s were generated separately
   and do not match; the plaques are positioned as percentages registered to that art.
7. **Nothing is clickable.** The CSS says so outright: the filter chips are the only tap targets.
8. **The privacy opt-out is unreachable.** `useSetLeaderboardPrefs` is exported and never
   imported; `LeaderboardHeader` takes a `settings` prop nothing passes. Students cannot hide
   from a board their supervisor can see, though `POST /api/leaderboard/prefs` still works.
   **This is a consent regression, not a taste question, and is in scope regardless of the rest.**

Reference research: Duolingo Leagues (Apple Design Award 2023; ~+25% lesson completion),
Clash Royale Path of Legends, Valorant/Marvel Rivals act rank, F1 broadcast standings, and the
social-comparison literature (global boards demotivate; cohort-relative boards do not).

## 2. What we're building

A **Duolingo-style weekly league**, promotion-only, on a black stage with a
**"Beam" podium** — a shaft of light onto the champion — where the podium is the top of the
*same continuous stage* as the ranked list, never a separate floating panel.

### 2.1 Decisions taken (with rationale)

| Decision | Choice | Why |
|---|---|---|
| Division source | **Earned by promotion**, not lifetime XP | That *is* the mechanic. `tierForXp` is leaderboard-only, so repurposing breaks nothing. |
| Division names | Reuse **Bronze · Silver · Gold · Platinum · Diamond** + existing colours | No new nomenclature or art; students already see these colours. |
| Pool | One pool per division, **all disciplines together** | A cohort this size split three ways makes leagues too thin to be a race. |
| Role filter | Stays, but as a **view filter only** | It must never change who you are actually racing, or ranks stop meaning anything. |
| Stakes | **Promotion only — no demotion, ever** | User decision. The cohort is named and supervisor-visible; public relegation is a real morale risk. |
| Rollover | **Lazy + idempotent on read**, no cron, no Celery | Matches the existing `xp_week` lazy-reset pattern. There is no Celery beat schedule, and the one existing queue has a known silent-drop bug. |
| Ceremony show-once | **Server-side flag**, not localStorage | CLAUDE.md's show-once invariant; must survive a device switch. |

### 2.2 Explicitly out of scope

Demotion. Cross-institution or global boards. A standings *archive* browsable by week (we
persist history, we do not build a UI for it). Milestone rewards. Diamond tournaments.

## 3. Mechanics

- **Divisions**: 1 Bronze → 5 Diamond. Everyone starts at 1.
- **Week**: the existing SGT Monday boundary and `xp_week` / `xp_week_start` tally. Unchanged.
- **Ranking**: within your division, by `xp_week` desc, ties stable by resolved display name —
  the existing `rank_entries` ordering, now scoped by division.
- **Promotion count**: `clamp(3, ceil(pool_size × 0.25), 7)`. Scales from a 6-person cohort to
  a 30-person one without a magic constant.
- **Diamond**: no promotion above it. The top 3 get a recorded placement instead, so the top
  division still has something to win.
- **Hidden students are excluded from ranking *and* from promotion counting.** A hidden student
  must not silently occupy a promotion slot.
- ~~**Pool splitting**: if a division exceeds 30 members, split into balanced pools of ≤30, keyed
  by a stable hash of `(student_id, week_start)` so membership is deterministic and doesn't
  churn mid-week. Inert below 30 — spec'd now so the threshold isn't discovered in production.~~
  **Superseded 2026-08-01 — see §10, Amendment A.**
- **One division is one pool, at any size.** The live board and the weekly close both rank a
  division as a single list, so they agree by construction. A division that crosses `POOL_MAX`
  (30) is still ranked whole and instead trips a `league_pool_max_exceeded` audit event, so the
  growth surfaces in the staff audit trail rather than in a silently divergent rank.

## 4. Data

### 4.1 Migration 016 (`016_leagues.sql`)

On `student_profiles`:
- `division SMALLINT NOT NULL DEFAULT 1`
- `rank_prev SMALLINT` · `rank_prev_day DATE` — powers movement arrows
- `league_result_seen_week DATE` — powers the show-once ceremony

New tables:
- `league_week(student_id TEXT, week_start DATE, division SMALLINT, xp_final INT,
  rank_final SMALLINT, outcome TEXT, PRIMARY KEY (student_id, week_start))`
- `league_seal(key TEXT PRIMARY KEY, sealed_at TIMESTAMPTZ NOT NULL DEFAULT now())`

`league_seal.key` is `'week:YYYY-MM-DD'` for a rollover or `'day:YYYY-MM-DD'` for the daily
rank snapshot — one guard serving both lazy jobs rather than two mechanisms. The primary key
*is* the lock: the first writer wins and does the work, everyone else gets a duplicate-key
error and skips. Both jobs then run in `BackgroundTasks`, so no student ever waits for them.

`outcome ∈ {'promoted', 'held', 'placed'}`. No `ADD CONSTRAINT IF NOT EXISTS` / `CREATE POLICY
IF NOT EXISTS` — Postgres rejects both (42601).

### 4.2 Graceful degradation

Like migration 012 before it, **the application must boot and serve a correct board before 016
is applied**: absent columns ⇒ division reads 1, no arrows, no ceremony, no rollover. The
feature ships dark and lights up when the migration lands. This keeps `main` deployable at all
times and is a hard acceptance criterion, not a nicety.

### 4.3 The rollover race (the one genuinely tricky part)

`xp_week` is never cleared at the week boundary — it is *ignored* once `xp_week_start` goes
stale. So last week's final score is still readable **until that student next earns XP**, at
which point `weekly_tally` overwrites it with the new week's gain.

If a student earns XP at 00:00 Monday before anyone opens the board, their final score for the
closed week is destroyed. Two writers, one guarantee:

1. **The earn path seals first.** `weekly_tally` already detects the stale-stamp transition.
   On that transition, write `(student_id, prev_week_start, xp_week)` into `league_week`
   *before* overwriting. Idempotent on the composite PK.
2. **The read path sweeps the rest.** The first board read of a new week takes the seal —
   `INSERT INTO league_seal(week_start) ON CONFLICT DO NOTHING` — and the winner of that race
   snapshots every profile still carrying the old stamp (i.e. everyone who didn't earn), then
   computes standings, writes outcomes, and bumps `division` for the promoted.

Both paths are idempotent and neither needs a worker, a lock, or in-process state — which
matters on a single Render worker that scales horizontally.

## 5. Backend shape

- **`tools/gamification/league.py`** — new, pure, no I/O (the `leaderboard.py` convention):
  `division_name`, `promote_count(pool_size)`, `close_week(...) -> outcomes`,
  `rank_delta(live_rank, rank_prev)`. Fully unit-testable without a DB.
  `split_pools` also lives in this module but **nothing calls it** — a tested, reserved
  primitive for a future scale-up, not part of the live mechanic (§10, Amendment A).
- **`tools/gamification/leaderboard.py`** — `rank_entries` gains a `division` scope and returns
  `division`, `rank_delta` per entry. Existing ordering and name resolution untouched.
- **`GET /api/leaderboard`** returns, in addition to today's payload: `division`,
  `division_name`, `promote_count`, `pool_size`, `week_ends_at`, and per-entry `rank_delta`.
- **`GET /api/league/result`** returns an unseen closed-week outcome, or null.
  **`POST /api/league/result/seen`** marks it seen.
- Both new endpoints go on the shared `limiter`, keyed by JWT sub — never the proxy peer.
- Blocking Supabase calls stay wrapped in `asyncio.to_thread` + timeout.

## 6. Frontend

The mockup is a sketch of the idea. The build is held to the project's design standard, which
means the following are requirements, not embellishments.

### 6.1 The Beam

- **Zero baked raster.** Pure CSS + inline SVG. `ped-gold/silver/bronze.webp` and `bg.webp` are
  deleted. This is what kills the mismatched-art finding permanently.
- **Real scale contrast**: champion portrait ≈1.7× second/third; champion plinth ≈2× their
  height. The current board's #1 sits 12px higher than #2 — that is why it reads flat.
- **One light source**: a clipped, blurred gradient ray from off-stage onto the champion, with a
  floor pool beneath. Deep-space backdrop, gold as the only accent.
- **Reveal choreography**: 3rd rises → 2nd rises → 1st lands and the beam ignites. Frozen
  completely under both `prefers-reduced-motion` and the in-app `data-motion="reduce"`.
- **Podium DOM order is 1 → 2 → 3**, with CSS `order` producing the visual 2-1-3. The current
  board's DOM is 2-1-3, so screen readers announce second place first.

### 6.2 The league list

- Division strip + current division + countdown to the Monday close.
- **A promotion line** across the list — the mechanic. Rows above it are tinted; the line is
  labelled and legible.
- **Movement arrows** per row (▲n / ▼n / —), from `rank_delta`. The reference point is a
  once-daily snapshot of the whole division, not each student's last visit, so every arrow
  on the board is measured from the same moment. No prior snapshot renders a dash, never a
  fake zero.
- **The chase hook gets real hierarchy**: "340 Lumens to the promotion line" as a prominent
  stat, not 16px body text. Below the line it's the distance up; above it, the distance to the
  student chasing you — which finally uses `computeRivals().below`.
- **Rows are tappable** → a peek sheet: name, division, weekly Lumens, streak, level.
- **Auto-scroll to your row** on load, plus a sticky compact "you" bar when your row is off-screen.

### 6.3 Craft floor

- **Two type families, not three.** One display + one text, tabular numerals on every number.
- **One accent — gold.** The rose "you" ring and the teal/violet tier rings go; division carries
  that meaning now.
- Every Eyecon tinted distinctly so the podium isn't three copies of one face.
- WCAG AA on the black stage. 390px-safe. Phone-landscape tier (`max-height:480px and
  pointer:coarse`) — width cannot identify a phone.
- No `background-attachment: fixed` (scroll jank on mobile Safari).

### 6.4 The privacy restoration

Wire `useSetLeaderboardPrefs` back in: the hide-me toggle and the optional display-name field
return to the board. ~~A hidden student sees their own board but appears to no one~~, and holds no
promotion slot.

**Struck text superseded by Amendment B** — a hidden student does *not* see their own board;
they are dropped from it like everyone else, and are shown their standing separately.

## 7. Testing

TDD throughout — failing test first, watch it fail, minimal pass.

- `tests/gamification/test_league.py` — pure core: promote counts across pool sizes 1…40,
  Diamond has no promotion, hidden students excluded from both ranking and slot counting,
  pool splitting is stable across calls within a week (now covering `split_pools` as a
  reserved primitive rather than a live rule — §10).
- `tests/gamification/test_league_rollover.py` — **idempotency is the headline**: sealing twice
  produces one set of outcomes; the earn-path seal and the read-path sweep agree; a student who
  earns at 00:00 Monday keeps their closed-week score. Per §10 it also proves a 35-member
  division closes as one contiguous 1…35 ladder with exactly one rank 1, and trips the
  `league_pool_max_exceeded` audit event.
- `tests/api/test_league_endpoints.py` — payload shape, rate-limit keying, and the
  pre-migration degradation path (absent columns ⇒ a correct, boring board).
- `tests/api/test_leaderboard_prefs.py` — the hide toggle round-trips and a hidden student is
  absent from every other viewer's board.
- **Ceremony show-once regression covering the repeat case** — per `/ship-check`, a second load
  must not re-show. This is the exact class of bug that has bitten this app before.
- `frontend/tests/league_logic.mjs` — client math, discovered by `npm run test:logic`.
- `frontend/tests/league_assert.mjs` — browser harness: promotion line present, arrows render,
  podium DOM order is 1-2-3, motion frozen under `data-motion="reduce"`, 390px-safe.
- `frontend/tests/leaderboard_mobile_assert.mjs` — updated for the new board.

## 8. Phasing

Per the standing rule: backend fully working first, then the world-class frontend.

- **Phase 1 — backend.** Migration 016 (authored, not yet applied), `league.py` pure core,
  earn-path seal, lazy sealed rollover, endpoint payloads, prefs restoration. Gate: `pytest -q`
  green, degradation path proven.
- **Phase 2 — frontend.** The Beam stage, the league list, interactions, responsive tiers.
  Gate: typecheck + build + the new and updated harnesses green.
- **Phase 3 — ceremony + lock.** Monday result screen, `docs/design-locks.md` entry superseding
  the 2026-07-13 lock, `APPLIED.md` updated when 016 is run.

Each phase commits and pushes on green.

## 9. Deployment note

Migration 016 must be applied via `/db-migrate` for divisions, arrows and the ceremony to
activate. Because §4.2 requires graceful degradation, the code can ship to `main` before the
migration is run — the board simply behaves like today's (single division, no arrows) until
it lands. Nothing about this change can boot `main` broken.

## 10. Amendments

Decisions reversed after this spec was approved are recorded here rather than by rewriting the
sections above, so the history stays legible — the same convention as the **Supersedes** line
at the top of this file. The superseded text is struck through in place and points here.

### Amendment A — pool splitting is out of the live mechanic (2026-08-01)

**Supersedes** the *Pool splitting* bullet in §3 and the `split_pools` entry in §5. Shipped in
`30133af` (*one division is one race — drop pool splitting from the rollover*) and `6bcaf9a`
(the audit tripwire). The full reasoning lives in the module docstring of
`tools/gamification/league_rollover.py`; the summary:

**What was wrong.** The two halves of the mechanic were built to different rules. The rollover
split each division into ≤`POOL_MAX` sub-pools and ranked each separately, while
`GET /api/leaderboard` ranked the whole division with no splitting at all. Above 30 members
those disagree — a student raced the whole division on the live board all week, then was judged
at the close against a different, hash-bucketed population. Migration 016 defaults every student
into division 1, so this was not a threshold waiting in the future: past 30 signups it was the
launch-day state.

**The decision.** *One division is one race.* Rank a division as a single list on both sides and
the live board and the weekly close agree by construction, at any cohort size. `split_pools`
solves a Duolingo problem — sharding hundreds of millions of users into 30-person races — that
an app serving one eye centre's students, tens at a time, does not have.

**Where the primitive went.** `league.split_pools` stays in `league.py`: pure, still unit
tested, called by nothing. It is a reserved primitive for a future scale-up, not part of the
live mechanic. If a cohort ever does outgrow a single pool, **split both sides in the same
change** — splitting only the rollover is exactly how this divergence happened.

**What replaced the threshold.** A division over `POOL_MAX` is still ranked whole, and now
writes a `league_pool_max_exceeded` audit event to `audit_events` — the table
`GET /api/admin/audit` serves, not the ephemeral `.tmp/audit_log.jsonl` that no reader in this
app opens and Render's disk discards on restart. A documented threshold nobody is watching is
how this shipped in the first place, so growth past the assumption now surfaces in the audit
trail before a student notices their rank stopped meaning anything.

### Amendment B — "sees their own board" was not buildable as written (2026-08-01)

**Supersedes** the struck clause in §6.4. Phase 2 (`eb72a9a`) restored the control itself; this
covers the half of §6.4 that the restoration could not honour.

**What was wrong.** §6.4 promised a hidden student "sees their own board", and `BoardSettings`
shipped copy saying so — but `rank_entries` filters `leaderboard_hidden` unconditionally, so a
hidden student is dropped from their *own* board too. There is no `is_you` row left, and
therefore no rank to read. The UI was making a promise the data could not keep.

**Why the filter was not relaxed.** The obvious fix — "drop hidden rows unless it's the
viewer" — was rejected. The consent guarantee rests on that filter having *no exceptions*: one
unconditional line is provable by inspection, whereas a conditional is something a later
refactor gets wrong, and the failure mode is a student appearing on a supervisor-visible board
they opted out of. The alternative of inserting the viewer into their own view was also
rejected: it shifts every rank below them, so the board they read would disagree with the board
everyone else reads.

**What shipped instead.** A separate `you_would_be_rank` on the payload, computed by
`leaderboard.would_be_rank` against the *visible* ladder using the identical
`(-xp, name.lower())` sort key — so the number a hidden student sees is exactly the rank they
would get by un-hiding, while nobody is ever inserted into any ladder. That equivalence is
pinned by a test that checks the prediction against the real ranker rather than restating it.
Rendered in `BoardSettings`, the one surface that can honour the promise, and the copy is now
"you'll still see **where you stand**" rather than "your own board". The payload gained a field,
so `PERSIST_SCHEMA_VERSION` → "10" (see [[project_persist_cache_buster]]).

**Testing note (extends §7).** `tests/api/test_leaderboard_prefs.py` landed as §7 specifies —
but 5 of its 8 tests passed *before* any fix, because the API was never broken, only
unreachable. Worth recording: a spec-named test file is not automatically a regression test.
The behavioural coverage is split — `league_assert.mjs` proves the switch is reachable and
POSTs; `leaderboard_privacy_assert.mjs` proves the states after the flip (standing shown,
failed save reported, hidden survives a reload, 44px touch targets). The reachability
assertion was verified to fail against the pre-fix build by reverting and rebuilding, not by
inspection.

### Amendment C — the visibility panel was removed (2026-08-02)

**Retires §6.4 and Amendment B as shipping requirements.** User instruction: remove the
visibility card from the leaderboard page entirely. Done — `BoardSettings.tsx`,
`useSetLeaderboardPrefs`, the `.bs*` styles and `leaderboard_privacy_assert.mjs` are deleted.

**What this means, recorded so it is not rediscovered as a bug.** Problem 8 of §2 ("the privacy
opt-out is unreachable") is now the intended state rather than a defect: the board is
everyone-by-default and there is no in-app way off it. A student flagged `leaderboard_hidden`
in the database stays hidden, sees a ladder with no row of their own, and gets no explanation —
`you_would_be_rank` is still computed and still sent, and nothing renders it.

**The server was deliberately left whole.** `POST /api/leaderboard/prefs`,
`leaderboard.would_be_rank`, the unconditional hidden-row filter and
`tests/api/test_leaderboard_prefs.py` all stay. Hiding must keep working for anyone already
hidden regardless of whether a control exists to unset it, and a future restoration should be a
UI job. Amendment B's *reasoning* — why the filter has no exceptions, why the viewer is never
inserted into their own ladder — still governs the code that remains.

**Not bumped**: `PERSIST_SCHEMA_VERSION` stays "10". The GET payload shape is unchanged; only
its consumer went away.
