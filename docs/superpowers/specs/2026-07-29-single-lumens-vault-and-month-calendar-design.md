# One vault, 20 vision badges + a month calendar on the streak card

**Date:** 2026-07-29
**Status:** approved (user, this session)
**Touches:** Home / Dashboard (locked — see `docs/design-locks.md`)

## Problem

Home carries **two** badge vaults side by side in `.hm-lower`: the Daily streak vault
(`MilestoneLadder`, 6 medallions keyed to the weekday streak) and the Lumens vault
(`LumenLadder`, 6 medallions keyed to lifetime `coins_earned`). Two collections competing
for the same shelf halves the pull of each, and the good art — Iris in an escalating
medallion, bronze laurel nest through cosmic winged deity — sits on the streak side while
the Lumens side carries a flatter gold-coin set.

Separately, the streak card spends its header on a daily-goal **percentage ring** and shows
only the current **7-day** week, which is too small a window to read a habit.

## Decisions (user, this session)

1. **One vault.** The streak vault is removed. The Lumens vault is the only collection.
2. **20 badges**, up from 6, themed on **vision/acuity** — the aesthetic of the retired
   streak medallions, *not* the gold-and-coins Lumens set.
3. **All 20 generated fresh** (Nano Banana flash). The 6 existing streak medallions and the
   6 existing Lumens medallions are both retired, so the escalation curve is even across 20
   rungs rather than stitched from two sets.
4. **Daily-goal ring dropped outright** — no text or bar replaces it.
5. **Month calendar replaces the week strip** on the streak card.
6. **The vault is a horizontal shelf** at every viewport, not a wrapping grid.

## Design

### The ladder

`LUMEN_BADGES` grows to 20 tiers on lifetime Lumens (`coins_earned`). Gentle early so the
first four land inside a week of normal use; steep late so the top rung is a genuine
long-haul goal (~6 months of heavy use at ~8k Lumens/month).

| # | Lumens | Name | Rarity | # | Lumens | Name | Rarity |
|---|--------|------|--------|---|--------|------|--------|
| 1 | 100 | First Blink | common | 11 | 8,200 | Hawkeye | rare |
| 2 | 300 | First Light | common | 12 | 10,000 | Night Vision | rare |
| 3 | 600 | Wide Awake | common | 13 | 12,500 | Laser Focus | epic |
| 4 | 1,000 | Clear View | common | 14 | 15,500 | Farsight | epic |
| 5 | 1,500 | Sharp Focus | uncommon | 15 | 19,000 | Prism Sight | epic |
| 6 | 2,200 | Keen Eye | uncommon | 16 | 23,000 | Third Eye | mythic |
| 7 | 3,000 | Steady Gaze | uncommon | 17 | 28,000 | All-Seeing | mythic |
| 8 | 4,000 | 20/20 Vision | uncommon | 18 | 34,000 | Cosmic Gaze | mythic |
| 9 | 5,200 | Crystal Lens | rare | 19 | 42,000 | Visionary | legendary |
| 10 | 6,600 | Eagle Eye | rare | 20 | 52,000 | Eye of Eternity | legendary |

Rarity spreads 4/4/4/3/3/2 across common→legendary so the existing per-rarity glow CSS keeps
working unchanged.

Names deliberately do **not** collide with the streak tier ladder in
`tools/gamification/streak.py::TIERS`, which stays as-is and still drives the streak card's
"Next: …" nudge.

### Art

`tools/rewards/lumen_badge_art.py` is rewritten with 20 entries and a prompt template modeled
on the retired **streak** medallions: Iris (the one-eyed, hairless, round mascot blob) framed
inside a collectible circular medallion, soft rounded 3D enamel-and-metal game-UI style, warm
and cute, no text. The 20 descriptions escalate along one continuous axis — frame material
(weathered bronze → iron → steel → silver → gold → gem-set gold → radiant crystal → cosmic),
setting (dawn field → workshop → observatory → storm → deep space), and mascot state (a
sleepy first blink → a crowned, winged, galaxy-irised deity).

`tools/rewards/generate_lumen_badges.py` keeps its `--estimate / --generate / --install`
shape; only the badge table behind it changes. Generation lands in `.tmp/lumen-badges/` for
review; `--install` writes `frontend/public/brand/lumen-badges/<slug>.jpg`.

Cost: 20 flash images ≈ US$0.80 plus retries. Paid calls only on explicit go-ahead, per
`CLAUDE.md`.

### The shelf

`.hm-lower` collapses to a single full-width column holding the one vault. `.hm-badges`
becomes a **horizontal scroll shelf** — one row, `overflow-x:auto`, `scroll-snap-type:x`,
edge fade masks, momentum scrolling on touch. On mount the shelf scrolls the **"next"** badge
into view (`scrollIntoView`, `behavior:"auto"` under reduced motion) so a student lands on
their target rather than on rung 1. The medallion size, rarity glows, `collected/next/locked`
states, `★` seal and `🔒` overlay are unchanged.

### The month calendar

`StreakTile` drops `.hm-goalring` (SVG + `%` readout) and the 7-cell `.hm-week` strip. In
their place, a month grid:

- 7 columns, weekday header `M T W T F S S`
- leading blanks so the 1st lands under its real weekday
- one cell per day of the current month, carrying the existing state vocabulary
  (`done` ✓ / `today` ring / `missed` / `rest` + `rest-done` moon / `upcoming`)
- a month label (`July 2026`) and an "N days this month" count

The flame, the big streak numeral, and the next-tier nudge all stay.

### Backend

`streak.py` gains `current_month_states(today, history)` — the sibling of
`current_week_states`, sharing one extracted `_day_state(d, today, done)` helper so the two
can never drift. It returns one `{day, date, state}` cell per day of `today`'s month, in
order. Pure, no I/O, same as everything else in that module.

`tools/progress/get_progress.py::_streak_detail` adds `"month": streak_engine.current_month_states(today, history)`.

Client-side, `StreakDetail.month` is typed **optional** and the calendar renders nothing when
it is absent, so a persisted-but-stale progress response can never paint a broken grid. The
leading-blank offset comes from `_DAY_NAMES.indexOf(month[0].day)` — never from parsing the
ISO string with `Date`, which would reintroduce a UTC/SGT off-by-one.

### Removed

- `MilestoneLadder.tsx`, `EyeconBadge.tsx`, `streakBadges.ts`
- `frontend/public/brand/badges/*.jpg` (6) and the superseded `lumen-badges/*.jpg` (6)
- `.hm-panel--streakbadge`, `.hm-goalring`, `.hm-rc`, `.hm-week`, `.hm-wd*` CSS

`BadgeRarity` and `BadgeState` move into `lumenBadges.ts`, since both of their current homes
are being deleted.

## Verification

- **pytest** — `current_month_states`: cell count equals the real length of the month across a
  31-day, a 30-day and a February; the first cell is the 1st and the last is the last day;
  every state in the vocabulary is reachable; weekends resolve to `rest`/`rest-done`.
  `_streak_detail` carries `month`.
- **aurora harness** — milestone-ladder assertions removed; the vault asserts **20** badges;
  `.hm-goalring` asserted **absent**; the month grid asserted present with a correct cell
  count; one new medallion asserted served over HTTP. `_mocks.mjs` and `tour_assert.mjs`
  progress mocks gain `month`.
- **Behavioral** — Home rendered on a prod build at 1440px and 390px: no horizontal page
  overflow (the shelf scrolls *inside* its own container), the shelf lands on the "next"
  badge, calendar dates align under the right weekday columns.

## Out of scope

- The streak engine's tier ladder (`TIERS`), the freeze rules, and the check-in flow.
- The Lumens economy — no award amount changes. Only the badge thresholds are new.
- `GreetingHero`, `FeatureCarousel`, the Atlas Rail, and every other Home surface.
- The leaderboard's own streak/Lumens badges (different feature, different lock).
