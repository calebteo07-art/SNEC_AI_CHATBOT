# Homepage (Dashboard) Redesign — "Warm Premium" — Design Spec

Date: 2026-07-01
Status: Approved design, ready for implementation plan
Owner: EyeBot

## 1. Goal

Replace the current dark, cluttered student dashboard (`frontend/src/aurora/screens/Dashboard.tsx`)
with a **warm, premium, playful-but-grown-up bento homepage**. The learner should land
on something beautiful that (a) makes the daily streak + gamification the emotional
centre, (b) greets them with an ever-changing, teasing, eye-care-flavoured line, and
(c) gets them into Tutor / Virtual Patients / Flashcards in one click.

This is primarily a **visual + interaction redesign plus one new pure-logic module
(the greeting engine) and one brand asset (the Iris mascot)**. All gamification data
already flows through `useProgress` → `/api/progress`; we are not changing that contract.

The approved look is the mockup at (scratch) `mock7.html` — screenshots in the design
thread. Warm cream bento, Gemini-gradient blended logo, bespoke SVG icon set, Bricolage
Grotesque display, and "Iris" (the eye mascot) peeking from the greeting.

## 2. Look & feel

- **Warm layered canvas** — cream base (`#F1E3CF`) with soft peach/rose/lilac radial
  bleeds. This REPLACES the current dark dashboard canvas (see §6 theme change).
- **Bento layout**, tiles of varying weight:
  1. Hero row: **Greeting tile** (≈1.66fr) + **Streak tile** (1fr).
  2. **Feature cards** row: Tutor / Virtual Patients / Flashcards (3 equal, saturated gradients).
  3. Lower row: **Milestone ladder** (≈1.55fr) + **This-week stats** (1fr).
- **Type:** Bricolage Grotesque (display: greeting, titles, big numbers) over the existing
  DM Sans body; JetBrains Mono for small mono labels where wanted.
- **Custom SVG icon system** (one inline `<symbol>` sprite): eye (logo), tutor, vp,
  flash, flame (two-tone), medal, arrow, refresh, check, sun, lens, eye, eagle, spark,
  moon. No emoji anywhere in the shipped UI.
- **Logo** = Gemini-gradient eye glyph + gradient wordmark, blended onto the canvas
  (no white-on-gradient tile).
- Soft **layered shadows**, warm hairline borders (`#EBDFCB`), 24px card radius.
- **Iris mascot** (transparent PNG) in the greeting tile with a gentle idle bob.

## 3. Components

New/rewritten, under `frontend/src/aurora/` (match existing conventions; keep files focused):

| Component | Responsibility | Key inputs |
|-----------|----------------|-----------|
| `screens/Dashboard.tsx` (rewrite) | Compose the bento; own the post-session toast/confetti (kept from today) | `useAuth`, `useProgress` |
| `components/home/GreetingHero.tsx` | Eyebrow, rotating greeting, level-up XP bar, CTAs, Iris | greeting result, level/rank/xp, track |
| `components/home/StreakTile.tsx` | Flame + count, week dots, daily-goal ring, next-tier | `streak_detail`, `xp_today/daily_goal` |
| `components/home/FeatureCard.tsx` | One gradient feature card (icon tile, title, sub, button) | tone, href, copy, icon id |
| `components/home/MilestoneLadder.tsx` | Tier ladder with done/next/locked states + custom icons | `streak_detail` (current, tiers) |
| `components/home/WeekStats.tsx` | Four stat tiles (real data only) | derived stats (see §4) |
| `components/home/Icon.tsx` + sprite | Bespoke SVG icon set via `<use href>` | icon id, size |
| `lib/greeting.ts` (new, pure) | The rotating teasing greeting engine (see §5) | context object |

The Atlas Rail / app shell is unchanged; only the dashboard route content changes.

## 4. Data mapping (real fields only)

From `ProgressData` (`useProgress`) + `user`:

- **Level ring / rank:** `level` + `rankForLevel(level)` (existing `lib/rank.ts`).
- **Level-up XP bar:** progress within level = `xp % 500` / 500; "N to go" = `500 - (xp % 500)`.
  (Uses existing `XP_PER_LEVEL = 500`.)
- **Daily-goal ring:** `xp_today` / `daily_goal`.
- **Streak tile:** `streak_detail.{current,best,freezes,week,tier,next_tier,to_next}`;
  week dots reuse the existing per-day `state` values (`done/today/missed/upcoming/rest/rest-done`).
- **Milestones:** the existing tier ladder (from `StreakBoard`'s `TIERS`) lit by `current`.
- **This-week stats — map to backed fields, do NOT invent numbers:**
  - Sessions total → `session_count`.
  - Best streak → `streak_detail.best`.
  - Recall accuracy → mean of `topic_performance[].score` (0 if empty), shown as %.
  - Cases run (this week) → count `sessions[]` with `mode === "case"` and `timestamp` within 7 days.
  - (Final four labels can be tuned; every displayed number must have a source.)

If a desired stat has no source, it is **out of scope for v1** rather than faked. Adding
new fields to `/api/progress` is a separate, optional follow-up with its own backend test.

## 5. Greeting engine (`lib/greeting.ts`)

Pure, tested, deterministic-within-a-render. `pickGreeting(ctx, seed)` returns
`{ eyebrow, title, emphasis, sub }` where `emphasis` is the substring rendered in the
accent colour (e.g. "retina").

- **Context** `ctx`: `{ firstName, track, hour, streak, doneToday, missedYesterday,
  xpToNext, goalMet, bestStreak }`.
- **Buckets** (priority order): `goalMet` → `comeback` (missed yesterday, streak reset) →
  `streakMilestone` (streak in {3,5,7,10,…}) → `nearLevelUp` (xpToNext ≤ ~80) →
  `timeOfDay` (morning/afternoon/evening) → `generic`. Each bucket holds an array of
  eye-care-flavoured teasing lines.
- **Rotation:** `seed` = day-of-year + a visit counter persisted in `localStorage`
  (`eyebot_greet_seed`). Same seed → same line within a render; **"Surprise me"** bumps
  the counter → new line. Never repeats the immediately-previous line.
- **Starter bank** (editable; ASCII, ≤ ~90 chars):
  - "Back already, {name}? The retina missed you."
  - "{streak} days straight — even the optic nerve is impressed."
  - "{xpToNext} XP from Level {next}. That's three flashcards and a coffee."
  - "Skipping today? Bold. The cornea is watching."
  - "Rise and shine — those flashcards won't grade themselves."
  - "Goal smashed. Iris is doing a little dance."  (goalMet)
  - "Missed yesterday? The streak forgives. Iris remembers. Let's rebuild."  (comeback)

**Tests** (`frontend/tests/` node harness or a small vitest-style check): every bucket is
reachable, output is stable for a fixed seed, "Surprise me" changes it, emphasis substring
is always present in title, no line exceeds the length cap.

## 6. Theme change (important)

Today `aurora.css` forces a **dark** canvas + mesh via `.aurora-main:has(.aurora-dash)`.
The new home is **light/warm**, so:

- Introduce a new root class for the redesigned page (e.g. `.home` / `.aurora-home`) and
  scope the warm canvas + all new styles to it.
- Remove/rewrite the dark `.aurora-dash` rules **without touching other screens** (chat,
  cases, flashcards, admin keep their own canvases). Verify the shell background and the
  Atlas Rail still read correctly against the warm page.
- New styles live in a focused block (new `aurora/home.css` imported alongside, or a clearly
  fenced section of `aurora.css`) so the old dashboard CSS can be deleted cleanly.

## 7. Assets & fonts

- **Iris:** ship `frontend/public/brand/iris.png` (the chosen render, background stripped to
  true alpha). Generator committed at `tools/media/generate_mascot.py`; the checkerboard→alpha
  strip is made reproducible (fold the saturation-flood-fill into a small
  `tools/media/` post-step or document the params). Optional later: an expression set
  (idle/wink/celebrate/"watching") for streak-reactive Iris.
- **Font:** add **Bricolage Grotesque** via `next/font/google` in `app/layout.tsx`, exposed as
  `--font-display-alt` (or similar); use only on the home display elements so the rest of the
  app is unchanged.

## 8. Motion & accessibility

- Iris idle bob; card hover lift; flame flicker (reuse existing keyframes). All ambient
  motion on pseudo-elements so one-shot entrances survive.
- Respect `prefers-reduced-motion` **and** `html[data-motion="reduce"]` (freeze bob/flicker/rings).
- One `<h1>` on the page (the greeting) for a11y; icons `aria-hidden` with labelled
  interactive elements; ring/goal have `aria-label`s. Colour-contrast checked on the warm bg.

## 9. Testing / verification (definition of done)

- `frontend`: `npm run typecheck && npm run build` green.
- Greeting-engine unit tests green (all branches, stability, surprise, length).
- **`aurora_assert.mjs` updated** to the new structure (new testids: e.g. `home-root`,
  greeting `h1`, `streak-tile`, `milestone-ladder`, feature cards) and green, including the
  390px no-horizontal-overflow check and the reduced-motion pass.
- Mobile: bento collapses to a single column; Iris scales down or hides on narrow widths;
  no overflow at 390px.
- `python -m pytest -q` green (backend untouched in v1; if any `/api/progress` field is added,
  it ships with a test).
- Manual: dashboard renders with live-shaped mock data; greeting reshuffles; all three feature
  cards navigate.

## 10. Scope

**In (v1):** dashboard visual rebuild (bento, warm theme scoped to home), greeting engine,
Iris hero asset + custom SVG icons + Gemini logo, real-data stat tiles, updated harness.

**Out (later):** Iris expression set / streak-reactive poses; leaderboards/leagues; per-milestone
generated art; new `/api/progress` stat fields; recolouring the rest of the app.

## 11. Open items to confirm during planning

- Exact `/api/progress` handler + whether `sessions[]` carries enough to derive the
  this-week stat honestly (else swap that tile for a backed metric).
- Final greeting-line bank (user may add lines/tune the cheek level).
- Whether Bricolage Grotesque is acceptable as a second display font vs. reusing DM Sans.
