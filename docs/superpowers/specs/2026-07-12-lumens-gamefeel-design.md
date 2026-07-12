# Lumens & Game-Feel Overhaul — Design Spec

- **Date:** 2026-07-12
- **Status:** Approved in brainstorming; pending spec review → implementation plan
- **Owner:** EyeBot (SNEC allied-health training platform)
- **Scope:** Unify all in-app currency into a single game coin ("Lumens"), give
  flashcards a video-game pause/quit flow, replace weak achievement toasts with
  big image banners across all features, add a Lumens-badge card to the homepage,
  and remove daily earning caps.

---

## 1. Goals

Make the whole app *feel like a game*, coherently:

1. **One currency, everywhere: "Lumens."** Replace the scattered XP / points /
   score / charge language with a single named coin and a single coin icon (a
   gold disc with an engraved iris).
2. **Flashcards pause flow.** Replace the Exit button with a neon-red, satisfying
   arcade **Pause** button that opens a menu: Resume · Switch deck · Quit. Quitting
   warns the player and actually costs Lumens; it routes home. Switch deck routes
   back to topic selection with no penalty.
3. **Big image reward banners.** Every unlock (achievements across tutor /
   flashcards / OSCE, streak-badge unlocks, Lumens-badge unlocks, level-ups) fires
   a full-screen, in-your-face, nano-banana-generated celebratory banner that can
   interrupt what the student is doing — replacing the current "black text on
   white card at the side" toasts.
4. **Homepage Lumens-badge card.** Replace the `WeekStats` card (to the right of
   the streak-badge card) with a Lumens-badge collection card: same vibe as the
   streak badges, distinct design, Selena as the mascot, funny + beautiful.
5. **No daily earning limit.** Remove the only real daily cap so students compete
   freely.

## 2. Locked decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Coin name | **Lumens** (icon: gold coin with an engraved iris/pupil) |
| Quit penalty | **Forfeit this round's unbanked Lumens + a flat −20** |
| Penalty stakes | **Live** — the −20 truly leaves the balance and can drop leaderboard rank; earned badges are protected by a separate lifetime counter |
| Currency architecture | **Reskin** the existing `xp` balance as Lumens; add a lifetime `coins_earned` column for badge permanence (no column rename) |
| Reward detection | **Client-derived** queue watching `/api/progress` deltas + achievement crossings (no new backend unlock write-path) |
| `WeekStats` stats | **Dropped** (not relocated) |
| OSCE economy | **In** — OSCE awards Lumens scaled to the final station grade |
| Art generation | **Placeholders first (green, keyless); paid nano-banana gen only on explicit go-ahead** |

## 3. Architecture

### 3.1 Currency model — reskin, don't re-plumb

There is exactly one currency in the DB today: `student_profiles.xp`. Everything
else (level = `xp//500+1`, leaderboard rank, combo, "score") is derived or
cosmetic.

- **`xp` becomes the Lumens *balance*** — the internal column keeps the name `xp`
  (no risky rename of a live prod column across backend + migrations + tests); the
  **UI relabels it "Lumens"** everywhere.
- **New lifetime column `coins_earned`** (bigint, monotonic, only increases) drives
  the Lumens badge tiers, so a forfeit that lowers the balance never removes an
  earned badge.
- **Level & leaderboard stay derived from the balance** → a forfeit costs rank
  ("live stakes").

This is surgical and prod-safe. Rejected alternatives: full column rename (risky,
big diff, prod migration on a live column) and a second parallel currency
(reintroduces the "different currencies" problem being removed).

### 3.2 Reward detection — client-derived queue

A single reward queue (provider in the shell layout) receives rewards from two
sources and shows one banner at a time:

1. **Derived watcher** (`useRewards`) compares `/api/progress` against a
   per-student localStorage high-water mark and enqueues **level-ups**,
   **streak-badge** unlocks, and **Lumens-badge** unlocks when a threshold is
   newly crossed.
2. **Explicit enqueue** from feature completion handlers (flashcards perfect deck,
   OSCE pass/flawless, tutor milestones) for named **achievements**.

A celebrated-set in localStorage (keyed by `studentId`) prevents re-firing. This
mirrors how streak badges already derive purely from server numbers, so no new
backend unlock endpoint is required.

## 4. Modules

### M0 — Lumens foundation (backend)

- **Migration `tools/db/migrations/009_lumens.sql`** (via `/db-migrate`, ledgered
  in `APPLIED.md`):
  ```sql
  ALTER TABLE student_profiles
    ADD COLUMN coins_earned bigint NOT NULL DEFAULT 0;
  ALTER TABLE student_profiles
    ADD CONSTRAINT student_profiles_coins_earned_nonneg CHECK (coins_earned >= 0);
  ```
  (Emit as two statements; no `IF NOT EXISTS` on the constraint — Postgres 42601.)
- **`tools/profile/update_profile.py`**: when the applied `xp_delta > 0`, also
  `coins_earned = current_coins_earned + xp_delta` in the same update. Never
  increment on `xp_delta <= 0` (forfeits/penalties leave lifetime untouched).
- **`tools/profile/get_profile.py`**: default `coins_earned` to `0`; when reading,
  the progress layer falls back `coins_earned or xp` (so the home badge card looks
  correct in the window between deploy and migration — before any forfeit, lifetime
  ≈ balance).
- **`tools/progress/get_progress.py` + `/api/progress`**: add `coins_earned` to
  `ProgressData` (fallback to `xp` when absent). Keep `xp` field for back-compat;
  the UI reads `xp` as the Lumens balance and `coins_earned` for badge tiers.
- **Remove the only daily cap:**
  - Delete `CHAT_XP_DAILY_CAP` and its enforcement in
    `frontend/src/lib/legacy/gamification.ts` (`addChatXp` always grants full
    amount) and remove the "you've hit today's chat XP" toast in
    `frontend/src/aurora/screens/Tutor.tsx`.
- **Relax the per-request clamp:** `min(body.xp_delta, 500)` →
  `min(body.xp_delta, 5000)` in `tools/api/routers/student.py` flashcards complete
  handler. This is a per-request anti-abuse clamp, never a daily cap; 500 could rob
  a legit high-combo perfect deck. Update the existing clamp test accordingly.

### M1 — Lumens visual identity (shared frontend)

- **`<Lumen>` SVG icon** — a gold coin disc (radial gold gradient + rim highlight)
  with an engraved iris (concentric ring + pupil + a single glint), self-contained
  SVG with inline gradients. SVG (not nano-banana) because it renders inline
  everywhere at many sizes and must stay crisp and tintable. Legible at ≥14px.
- **`<LumenCount value size />`** — icon + formatted number, the canonical way to
  show a Lumens amount.
- **Relabel** every currency surface to "Lumens" with the icon:
  - Flashcards HUD running total ("score") — `Flashcards.tsx`, the front-face
    charge meter "XP/Charge up/Banking…" — `McqCard.tsx`, the payoff "+N points" —
    `Payoff.tsx`.
  - Home level/XP bar — `Dashboard.tsx`, `GreetingHero.tsx`.
  - Leaderboard XP column and tier "+XP" labels — `Leaderboard.tsx`,
    `TierBand.tsx`, `LeaderboardRow.tsx`.
  - Any "XP" copy in tutor.
- **Coin color token** already exists (`--fc-coin` / `--fc-coin-d`); reuse and
  promote a shared `--lumen`/`--lumen-d` alias in the global stylesheet.

### M2 — Flashcards pause + quit/switch popup

- **Neon-red arcade Pause button** replacing `.flash-exit`:
  - New `.flash-pause` in `aurora.css`: gradient over `--fc-red`,
    `box-shadow: 0 5px 0 var(--fc-red-d)` + a `rgba(255,59,48,.5)` glow, uppercase,
    `.flash-press` collapse-on-press (translateY + shadow shrink) — the same "toy
    button" tactility as `.flash-advance`/`.flash-start`. A pause glyph (two bars).
  - Shown during the **study loop and intro** (where there's an active game). The
    **selection and results screens** keep a quiet glass **Home** pill (nothing to
    pause there; the nav rail also exits).
- **`<PauseMenu>` component** (`components/flashcards/PauseMenu.tsx`) — dark-arcade
  modal following the `CommandPalette` dialog pattern (`role="dialog"
  aria-modal="true"`, backdrop click-close, Escape) but surfaced with `--fc-*`
  dark tokens and `.flash-press` buttons; rendered inside `FlashShell` at
  `z-index ≥ 200`.
  - **Copy:** header **"PAUSED"**; buttons **Resume** (primary), **Switch deck**
    (neutral), **Quit game** (danger red).
  - **Switch deck** → the existing `newDeck()` reset back to the topic fan; **no
    penalty**.
  - **Quit game** → a second confirm step:
    - Header **"Quit for real?"**
    - Body: *"You'll forfeit this round's Lumens and lose 20 from your stash — and
      your rank feels it. No take-backs."*
    - Buttons **"Quit & take the hit"** (danger) / **"Keep playing"** (safe).
    - On confirm: `POST /api/flashcards/forfeit` → then `router.push("/dashboard")`.
  - **Opening the menu freezes the study loop** — ChargeBeat timers / auto-advance
    pause while the menu is open, resume on Resume.
- **Backend `POST /api/flashcards/forfeit`** in `tools/api/routers/student.py`
  (rate-limited on the shared limiter): server owns the `−20` constant, calls
  `update_profile(student_id, xp_delta=-20)` (floors at 0, does not touch
  `coins_earned`), returns `{ xp, level }` (new balance). The "forfeit this round's
  Lumens" part is automatic — those Lumens were never banked (banking only happens
  on `/complete`, which quitting skips).

### M3 — Reward banner system (unified, image-driven)

- **`<RewardBanner>`** (`components/rewards/RewardBanner.tsx`): full-screen
  celebratory **takeover** rendered via portal at very high z-index; spring-in
  (motion/react), confetti, a nano-banana banner artwork, a big title + subtitle,
  and the Lumen reward if any. Auto-dismiss ~4s; tap / Escape to continue. Designed
  to interrupt whatever is on screen.
- **`<RewardQueueProvider>`** mounted in the shell layout
  (`app/(shell)/layout.tsx` or the existing provider chain): holds a FIFO queue,
  exposes `enqueueReward(reward)` via context, shows one banner at a time.
- **`useRewards` hook**: reads `useProgress()`; on data change computes crossings
  vs a per-student localStorage high-water mark
  (`eyebot_rw_<studentId>`: `{ level, streakTier, lumenTier, achievements: [] }`)
  and enqueues `level-up`, `streak-badge`, `lumen-badge` rewards for newly crossed
  thresholds; updates the mark.
- **Reward taxonomy** (`kind`): `achievement | streak-badge | lumen-badge |
  level-up`. Each maps to a banner art template (see M5) with per-reward title /
  subtitle text overlaid, so art count stays small while every unlock gets a
  beautiful banner.
- **Retire** `frontend/src/screens/AchievementToast.tsx`
  (`AchievementToast`/`AchievementManager`, the white glass card) and the sonner
  achievement/level-up `toast.success(...)` calls in `Flashcards.tsx` / `Tutor.tsx`.
  Sonner stays available for genuinely mundane, non-reward notices.
- **OSCE joins the economy** (`tools/api/routers/cases.py` `case_submit`):
  - Compute `lumens_awarded = round(score_100 * 2)` (0–200; grading-dependent, per
    the locked decision) and call `update_profile(student_id, ..., xp_delta=
    lumens_awarded)`. Return `lumens_awarded` in `CaseSubmitResponse`.
  - Frontend `CaseSession.tsx` `handleSubmit` / `StationResult`: enqueue an OSCE
    reward banner with the awarded Lumens, and enqueue achievements for
    `station_pass` (≥60), `flawless_station` (score 100 & safe & no missed
    critical), and `first_station` / `stations_10` cumulative.

### M4 — Homepage Lumens-badge card (replaces `WeekStats`)

- **`frontend/src/aurora/components/home/lumenBadges.ts`** — 6 tiers keyed to
  `coins_earned`, Selena mascot art, a distinct-but-sibling vibe to the
  vision-acuity-themed streak badges (this ladder is light/wealth themed):

  | Tier | `at` (lifetime Lumens) | rarity | tagline (draft) |
  |---|---|---|---|
  | Spark | 250 | common | "A tiny gleam. Selena approves." |
  | Glimmer | 1,000 | uncommon | "Ooh, shiny. Keep 'em coming." |
  | Glow-Up | 2,500 | rare | "You're literally glowing now." |
  | Floodlight | 6,000 | epic | "Blindingly bright. Shades on." |
  | Blaze of Glory | 12,000 | mythic | "Certified radiant. A whole vibe." |
  | Supernova | 25,000 | legendary | "You have become light itself." |

- **`<LumenLadder detail />`** (`components/home/LumenLadder.tsx`) — mirrors
  `MilestoneLadder`: `.hm-panel` titled "Lumens vault" with a badge shelf; each tier
  rendered by **`<LumenBadge>`** (`components/home/LumenBadge.tsx`, mirrors
  `SelenaBadge` collected/next/locked states, reusing the existing badge CSS in
  `home.css`).
- **Placement:** replace `<WeekStats>` at `Dashboard.tsx` in the `.hm-lower` grid
  with `<LumenLadder detail={{ current: progress.coins_earned, ... }} />`.
- **`WeekStats` is dropped** (component + its render). Remove the now-orphaned
  `<WeekStats>` import; leave `home.css` `.hm-stats` rules only if still referenced
  elsewhere, otherwise remove the orphaned CSS the change creates.

### M5 — Nano-banana art (placeholders first)

Follow the established `crest_art.py` + `generate_crests.py` pattern
(`--estimate/--generate/--install`, refuses `MOCK_MODE`, flash model
`gemini-3.1-flash-image`, green-key → webp), plus a keyless placeholder scaffold so
everything ships green.

- **Lumens badge medallions** — `tools/rewards/lumen_badge_art.py` (prompt registry,
  Selena mascot, `reference=True` to `iris.png`) + `tools/rewards/generate_lumen_badges.py`
  → `frontend/public/brand/lumen-badges/{spark,glimmer,glow-up,floodlight,blaze,supernova}.jpg`.
- **Reward banner art templates** — `tools/rewards/banner_art.py` +
  `tools/rewards/generate_reward_banners.py` →
  `frontend/public/brand/reward-banners/{achievement-flashcards,achievement-tutor,achievement-osce,level-up,badge-unlock}.webp`
  (badge-unlock is a celebratory frame the specific tier medallion overlays onto).
- **Keyless placeholders** — `tools/rewards/make_reward_placeholders.py` (mirrors
  `make_feature_placeholders.py`): clearly-marked placeholder art into the same
  paths so the UI verifies without a paid call; overwritten by `--install`.
- **Paid gen runs only on explicit go-ahead** (standing rule + `MOCK_MODE` refuses
  the live path anyway).

## 5. Data flow summary

- **Earning Lumens:** flashcards `/complete` (clamped ≤5000/request), tutor
  `/gamification/sync` (uncapped, no daily cap), OSCE `case_submit`
  (`round(score_100*2)`) → all funnel through `update_profile` which bumps both
  `xp` (balance) and `coins_earned` (lifetime).
- **Spending / penalty:** flashcards `/forfeit` → `update_profile(xp_delta=-20)`
  (balance only; lifetime untouched).
- **Display:** everything reads `/api/progress` (`xp` as balance,
  `coins_earned` for badges) via `useProgress()`.
- **Rewards:** `useProgress()` change → `useRewards` derives level/streak/lumen
  crossings; completion handlers enqueue achievements → one `<RewardBanner>` at a
  time.

## 6. Achievement catalog (draft — all features)

Named achievements funnel into the reward queue as `kind: "achievement"`; badge
ladders and level-ups are their own kinds.

- **Flashcards:** `first_deck`, `perfect_deck` (100%), `combo_godlike` (×4 combo),
  `cards_50`, `cards_100`, `cards_500` (cumulative).
- **Tutor:** `first_chat`, `curious_50` (50 messages cumulative), `deep_dive`
  (long single session).
- **OSCE:** `first_station`, `station_pass` (≥60), `flawless_station` (100 & safe &
  no missed critical), `stations_10`.

(Exact thresholds tunable during implementation; each has a title + subtitle for
the banner and maps to its feature's banner-art template.)

## 7. Design-lock amendments (`/design-lock`)

`docs/design-locks.md` is updated for the two locked surfaces this touches:

- **Flashcards (LOCKED):** red is no longer *only* for wrong-answer verdicts — a
  neon-red **Pause** control (control-chrome) is now permitted; Exit is replaced by
  Pause + a dark-arcade PauseMenu (Resume / Switch deck / Quit-with-penalty).
- **Home (LOCKED):** the `.hm-lower` right slot is the **Lumens-vault** badge card
  (was `WeekStats`); the Lumens-vault and streak-badge cards are sibling-vibe but
  distinct.

## 8. Testing strategy

- **Backend pytest** (`tests/`, MOCK_MODE):
  - `coins_earned` increments by a positive `xp_delta` and **not** by a negative
    one (forfeit).
  - `/api/flashcards/forfeit` deducts 20, floors at 0, leaves `coins_earned`
    unchanged.
  - OSCE `case_submit` awards `round(score_100*2)` Lumens and returns
    `lumens_awarded`.
  - Per-request flashcards clamp is 5000 (updated existing clamp test); no daily
    cap path exists.
- **Frontend** (`frontend/tests/` harnesses + typecheck + build):
  - Reward queue fires exactly once per newly-crossed threshold (high-water mark
    prevents re-fire on refetch).
  - PauseMenu opens/closes, freezes the study loop, Quit calls forfeit then routes.
  - LumenLadder renders collected/next/locked from `coins_earned`.
  - `<Lumen>` icon renders; currency labels read "Lumens".
- **Harness** (`/harness aurora`): home assertions updated for the Lumens-vault
  card; flashcards Pause button present. (Aurora harness has a known pre-existing
  RED at the flashcards D2 back-face assertion, unrelated.)
- **Ship-check behavioral verify** (`/ship-check`): play flashcards → pause → quit
  (see penalty + rank drop) → earn across a badge threshold (see banner) → confirm
  the homepage Lumens-vault card.

## 9. Rollout / prod coordination

- **Migration 009 must be applied** before/at deploy. Code degrades gracefully
  (`coins_earned` falls back to `xp`) so `main` never boots broken, but the badge
  card and forfeit-vs-lifetime protection are only fully correct once applied.
  Coordinate via `/db-migrate` + `APPLIED.md` (project invariant: fail-closed, no
  broken boot).
- **No new required secret/env var.**
- Art ships as placeholders (green); paid nano-banana gen is a separate, explicit
  step.

## 10. Non-goals / out of scope

- Renaming the `xp` DB column (kept as internal name).
- Untangling the flashcards localStorage/backend XP double-write (pre-existing;
  display source of truth stays `/api/progress`).
- A spendable shop / anything to spend Lumens on beyond the forfeit penalty.
- Server-authoritative achievement persistence (client-derived with localStorage
  high-water mark is the chosen approach; server persistence is a possible future
  enhancement).
- Backfilling `coins_earned` from historical XP (starts at the migration default;
  fallback to `xp` covers the transition).
