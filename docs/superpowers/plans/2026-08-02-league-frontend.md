# Plan — The League, Phase 2: the Beam frontend

Spec: `docs/superpowers/specs/2026-08-01-leaderboard-league-design.md` §6.
Phase 1 (backend) shipped `731a22f`; **migration 016 was applied 2026-08-01** (`23e336b`), so
divisions, arrows, the rollover and the result endpoint are all live. The first Monday close is
**2026-08-03 SGT** — this phase must land before it, or students race a mechanic they cannot see.

## 0. North star

> A black stage. One gold light. The champion stands in the beam, and the league descends into
> the dark below them with a glowing promotion line cutting across it.

Everything below serves that sentence. The mockup was a sketch of the idea; the bar is the
project design standard (`feedback_design_standard`): custom everything, surgical colour,
spring motion, no stock chrome.

## 1. What is wrong with today's board (the audit, condensed)

Structural, not cosmetic — which is why this is a rebuild and not a repaint:

1. **Nothing is at stake below rank 3.** 27 of 30 students are reading a list they cannot act on.
2. **No time axis.** No countdown, no movement, no memory of last week.
3. **Flat podium.** #1 sits 12px above #2. Scale is the entire language of a podium.
4. **Three mismatched baked rasters** (`ped-gold/silver/bronze.webp`) whose overlays are pinned
   to the art by percentage — the art and the UI drift apart on every regeneration.
5. **The privacy opt-out is unreachable.** `useSetLeaderboardPrefs` is exported and imported by
   nothing; `LeaderboardHeader` takes a `settings` prop nothing passes. Students on a
   supervisor-visible named board have no way to hide. This is a live privacy bug, not a polish item.
6. **Three type families and four accent colours** (rose "you", teal/violet tier rings, gold).

## 2. Architecture

```
screens/Leaderboard.tsx          orchestrates; owns role filter + sheet state
  components/leaderboard/
    Beam.tsx                     the stage: ray, floor pool, 3 plinths (DOM 1-2-3)
    DivisionStrip.tsx            5 divisions + SGT countdown to the close
    ChaseStat.tsx                the one big number — the chase, with hierarchy
    LeagueRow.tsx                rank · arrow · Eyecon · name · Lumens · streak, tappable
    PromotionLine.tsx            the labelled divider — the mechanic made visible
    RowSheet.tsx                 peek sheet for a tapped row
    YouBar.tsx                   sticky compact bar when your row is off-screen
    BoardSettings.tsx            the privacy restoration
    LeagueResult.tsx             the Monday ceremony (Phase 3)
  leaderboard/league.ts          PURE client math — no imports, node-testable
  leaderboard.css                the black stage
```

`tiers.ts` keeps `computeRivals`/`splitPodium` (still used). `tierForXp`/`TIERS`/`bandRows`
become dead once the tier rings go — flagged, not deleted, since `tiers.ts` is shared surface.

**Deleted**: `Podium.tsx`, `LeaderboardHeader.tsx`, `LeaderboardRow.tsx`, `crests.tsx`,
`public/brand/leaderboard/{bg,ped-gold,ped-silver,ped-bronze}.webp` (~434 KB).
`public/brand/tiers/*.webp` is paid art orphaned by this change — **flagged, not deleted**.

## 3. Design system (the stage)

| Token | Value | Note |
|---|---|---|
| `--stage` | `#07070A` | deep space, blue undertone |
| `--stage-2` | `#101016` | raised row surface |
| `--ink` | `#F5F3EF` | warm white |
| `--ink-2` | `rgba(245,243,239,.62)` | 7.1:1 on stage — AA |
| `--ink-3` | `rgba(245,243,239,.52)` | 5.3:1 — AA at 13px |
| `--gold` | `#F5C542` | 12.4:1 — the ONLY accent |
| `--gold-hi` `--gold-deep` | `#FFE9A8` `#B07D12` | beam highlight / plinth shadow |

**Two families only**: Bricolage Grotesque (display) + `--font-body` (text). Bungee
(`--font-arcade`) is dropped — an arcade face is the opposite of award-winning here.
`font-variant-numeric: tabular-nums` on every number so ranks and Lumens don't jitter.

**Contrast is computed, not eyeballed** — every value above is a real sRGB ratio against
`--stage`, recorded so a later edit can be checked rather than guessed.

## 4. The Beam

- **Scale contrast**: champion portrait 108px vs 64px (**1.69×**); champion plinth 132px vs
  66px (**2.0×**). This is the finding from §1.3 answered numerically.
- **One light source**: a `clip-path` shaft from off-stage top, `filter: blur()`, plus a radial
  floor pool under the champion. Nothing else on the page emits light.
- **DOM order 1 → 2 → 3**, visual 2-1-3 via CSS `order` on a 3-column grid. Today's DOM is
  2-1-3, so a screen reader announces second place first.
- **Choreography**: 3rd rises (0ms) → 2nd (120ms) → champion lands (260ms) → beam ignites
  (500ms). Frozen under BOTH `prefers-reduced-motion` and `html[data-motion="reduce"]`.
- **Distinct faces**: the three default Eyecons are identical, so the *slot* carries the
  difference — metal plinth, metal rim-light, engraved rank numeral, and a low-opacity
  `soft-light` metal wash that reads as stage lighting. The mascot art itself is never
  recoloured (`feedback_selena_branding_mascot`).

## 5. The league list

- **Promotion line**: a labelled, glowing divider after row `promote_count`. Rows above it are
  tinted and carry `data-promo`. This is the mechanic; it is the most important pixel on the page.
- **Arrows** from `rank_delta`: `▲n` / `▼n` / `—` (no change). **No prior snapshot renders a
  faint `·`, never a fake zero** — a new student has not "held rank".
- **Chase stat** with real hierarchy — a 40px tabular number, not 16px body text:
  - below the line → Lumens to reach it;
  - above the line → Lumens of cushion over the chaser (finally uses `computeRivals().below`);
  - Diamond → no promotion above, so the framing is holding rank.
- **Countdown is real SGT**, not viewer-local. Next Monday 00:00 UTC+8 = Sunday 16:00 UTC — no
  DST in Singapore, so this is exact and pure (today's board only approximates it).
- Rows are `<button>`s → peek sheet. Auto-scroll to your row; sticky `YouBar` when it's off-screen.

## 6. Task list (TDD where there is logic to test)

| # | Task | Gate |
|---|---|---|
| 1 | `league.ts` + `frontend/tests/league_logic.mjs` | `npm run test:logic` |
| 2 | Types + hooks (`useLeaderboard`, `useLeagueResult`) | typecheck |
| 3 | `Beam.tsx` | typecheck |
| 4 | List: strip, chase, row, line, sheet, you-bar | typecheck |
| 5 | `BoardSettings.tsx` — the privacy restoration | harness |
| 6 | `leaderboard.css` — the black stage | build |
| 7 | `LeagueResult.tsx` ceremony + show-once | pytest regression |
| 8 | `league_assert.mjs` + rewrite `leaderboard_mobile_assert.mjs` | harness |
| 9 | design-lock, commit, push, CI | `gh run list` |

**`leaderboard_mobile_assert.mjs` must be rewritten, not patched.** Every one of its assertions
is registered to the baked art — the 4:5 plinth ratio, the `ped-(gold|silver|bronze)` background
match, the `translateY(-12px)` raise, the "size-only refit" fraction proof. All of it becomes
meaningless the moment the rasters go. Leaving it would be a harness that passes by describing a
board that no longer exists (`project_harness_false_green`).

## 7. Risks

- **Deadline**: the first rollover is 2026-08-03 SGT. Ship before it.
- **`splitPodium` on a short cohort**: a division of 1-2 must still render three plinths (open
  slots), or the stage collapses. Covered by the harness at cohort sizes 1, 2, 3, 30.
- **Ceremony fires on the homepage, not the board** — a student who never opens the leaderboard
  must still see they were promoted. Mount it in the app shell.
- **Concurrent sessions force-push `main`** — fetch and verify fast-forward before every push,
  and diff content, not just history (`project_concurrent_sessions_isolated_ship`).
