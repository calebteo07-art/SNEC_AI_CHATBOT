# The League — sixth pass, "ARCADE"

Date: 2026-08-04 · Surface: `/leaderboard` · Status: approved by the user, ready to plan

A **refine within the existing League lock** (`docs/design-locks.md`, "STRUCK" 2026-08-04 and
its three same-day retunes), not a rebuild. The user's words: *"the cards and elements are not
spaced out nicely (positioning is pivotal), and i want to have a more variety of pop of colors
in this entire page, design currently is decent, and make sure only podium will be able to
promote tiers, and make the lumens multiplier more obvious, instead of just in the question
mark popups. Must be an addictive gamified leaderboard design and frontend."*

"Design currently is decent" is the load-bearing half of that sentence: the material recipe,
the podium geometry, the ranks budget and the light canvas all **stay**. Four acceptance
criteria change, and each is named below rather than quietly overwritten.

## What stays pinned (do not touch)

Light canvas (base luminance > 0.7, stack ends in an opaque light solid) · every gradient
surface also declares a solid · the STRUCK recipe (dark `--mat-ink` outline ≥2px opaque, hard
zero-blur lip, hard-stop fills, lit top edge, drawn floor) · the lip ladder 5/3/2/0 with
`.lg-row` flat · podium holds exactly ranks 1–3, DOM order 1-2-3, painted 2-1-3, three distinct
metals sampled as paint, one crown on 1st · plinth mass both bounds (champion block ≥0.78× its
own figure stack, ≥0.6 on a landscape phone; no block taller than it is wide) · **≥8 ranks
legible on a ≥700px-tall viewport, ≥6 on a landscape phone**, chrome above rank 1 ≤250px ·
podium **and** promotion zone withheld on a role-filtered view · the unconditional
`leaderboard_hidden` filter · gold split by job (`--gold-ink` on white, `--ink-on-gold` on
gold) · zero rasters · no `background-attachment: fixed` · no dot grid, no sunburst · motion
frozen under both reduce signals · ≥44px touch targets · rung dead middle ≤34% · board ≥58% of
the field (1360–2000px) · the rhythm ordered, not flat · two type families, no novelty arcade
face.

⚠ **1366×768 sits ON the 8-rank floor with zero slack.** Anything this pass adds above the
ladder must be funded by something it removes.

---

## 1. THE ARENA — a fixed vivid field ⚠ *breaks a locked rule, on request*

**Changed criterion.** ~~"The field wears your own division's metal — Silver a cool steel
field, Gold amber, Diamond cyan — so climbing re-skins the whole screen"~~ → **the field is one
fixed arcade palette at every division; division identity moves onto the objects.**

The rule was the direct cause of the report. Silver's metal *is* grey, so the entire canvas
desaturates at tier 2 — which is where most of the cohort sits. "Hue is identity" was spent on
the largest surface in the app, and at four of five divisions that purchase buys a grey page.

**Four layers, still light** (both bounds are already gated and must still pass):

1. an opaque warm base `#FFFBF4`;
2. three corner blooms — coral, cyan, marigold — as radial gradients at high lightness. ⚠ No
   hard horizontal edge anywhere: `.aurora-main` does not scroll, so a horizon or floor line
   would sit still while the ladder slides past it;
3. **candy stripes**: the existing 135° stripe motif, now cycling four hues at ~6% alpha.
   Parallel and uniform — a surface, not an explosion. Still not a dot grid (the Figma/Notion
   tell) and still not the banned pass-2 sunburst;
4. the stage **spotlight keeps the division's metal**, so climbing still visibly changes the
   screen. Identity survives on the band, the podium, the road, the crest and the spotlight —
   it loses only the canvas.

The lane walls (≥1600px) keep working and take the deeper vivid surface.

## 2. ONE EDGE — the positioning fix

**The measured defect.** At the ≥1500px tier the page stacks a 1148px band, a ~470px centred
filter, a 700px stage and a 1148px ladder: four widths, four centres, no shared alignment edge,
and ~224px of dead flank either side of the stage. That is what "not spaced out nicely" is.

**Every block now shares the board's left and right edge.**

- **`.pod-deck`** — a new full-width struck platform the three blocks stand on (structural
  tier: 3px outline, 6px lip, drawn floor inside it). ⚠ **The blocks keep their exact current
  size.** The stage is capped and the *deck* is what widens — growing a block past ~700px of
  stage makes the champion a 2:1 slab, which is the bar-chart shape the STRUCK pass exists to
  prevent, and it is one-sidedly gated.
  - left flank: the promotion statement — `▲ TOP 3 PROMOTE → GOLD` (gold, struck);
  - right flank: the week clock, **moved out of the band's readout row**;
  - phone and landscape-phone: the flanks collapse to a single caption strip under the blocks.
- **`.lb-filter`** becomes a full-width strip sharing the same edge: chips left, cohort count
  (`6 in your division`) right. ⚠ Class names `.lb-filter` / `.lb-chip` are load-bearing —
  `league_assert` clicks `.lb-filter .lb-chip:has-text(...)` and a rename crashes the run.
  Restyled in place, never renamed. The control itself stays control-sized inside the strip;
  the lock's reasoning against stretching a three-chip switch across 860px still holds — what
  changes is that the strip *around* it is a labelled container with content at both ends.
- **Height is funded, not free**: the deck costs ~+8px of chrome, the clock leaving the band
  readout pays most of it back. Every viewport in the matrix is re-measured for the ranks
  floor, and 1366×768 must still clear 8.

## 3. COLOUR ON THE OBJECTS

A vivid field behind a grey ladder is still a grey ladder. Three new carriers, each identity —
none decorative:

- **Role hues.** OA / OT / PSA get three distinct hues, worn by the filter chips, the
  `.lg-role` tag, and **the row's gauge fill** — which is what puts colour on all 27 rungs
  rather than on the head alone.
  - ⚠ **Changed criterion**: the gauge's ~~"NO NEW HUE — graphite by default, gold inside the
    promotion zone, Gemini blue on your own row"~~ → **graphite gives way to the row's role
    hue**. You-blue still wins on your own row, and gold is **retained** for the underfilled-
    stage case, where a ladder row can still sit inside the cut. Under §4 no ladder row is ever
    inside the cut on a normal board, so gold-on-gauge would otherwise have gone dead.
  - Role colour must not out-shout the promotion gold on the deck: role hues are the *fill* of
    a small tag and a bar, never an outline or a lip.
- **Streak ember** on `.lg-streak` — the Forge's identity, already established elsewhere.
- **The five metals of the road**, now on-page (§5) instead of only inside the (?) sheet.

Kept unchanged: promotion gold means the mechanic, green means upward movement, `--you-blue`
means you.

## 4. ONLY THE PODIUM PROMOTES

`tools/gamification/league.py::promote_count(n)` → `min(n - 1, 3)`, with `n <= 1` → 0.
So 1→0, 2→1, 3→2, 4+→**3**.

- The `n - 1` guard **stays**: if everyone promotes, the promotion line stops meaning anything,
  which is the entire mechanic.
- **Blast radius is small and worth stating**: the old rule was `min(n-1, max(3, min(7, ceil(n*0.25))))`,
  which already returns 3 for every pool of 4–12. Only divisions of 13+ change (4–7 → 3).
- **The tradeoff, stated once**: at 30 students this is 10% mobility against Duolingo's 23%.
  Slower climb, much heavier podium. Raised with the user and confirmed.
- Frontend: with `promote_count = 3` and a 3-place podium, `promotionLineIndex(3, rest, 3)`
  returns 0, so `PromotionZone` is already withheld and `PromotionLine` draws at the top of the
  ladder. **Both components and `promotionLineIndex` are unchanged** — the cut still marks the
  boundary, immediately under the stage, and the deck carries the words. The zone and the
  ladder's gold rows survive for the underfilled-stage case (a pool of 2–3, where no podium
  renders), which is why that path gets a new gated fixture rather than being deleted.
- `RulesSheet` copy changes from "the top finishers move up … the gold zone at the top of the
  board is the cut" to the podium being the cut.

## 5. THE MULTIPLIER — module + road + next-rung hook

Today: a small `×1.1` chip in the band head, and the full road only inside the (?) sheet.

- **The module.** A struck gold block in the band head — `×1.1` large over `LUMENS` — at the
  medallion lip tier. ⚠ Any glyph on a gold fill uses `--ink-on-gold` (6.7:1), never
  `--gold-ink` (3.0:1 on gold).
- **The road, on-page.** The five `.tb-pip` rungs gain their `×N` labels and sit in the head's
  elastic middle track: `Bronze ×1 · Silver ×1.1 · Gold ×1.25 · Platinum ×1.5 · Diamond ×2`,
  your rung lit, locked rungs still showing their own metal at low opacity (a trophy road that
  hides what is ahead is not a road). ⚠ `.tb-pip` must keep painting its own metal — the
  five-distinct-metals gate samples it as **paint**, not as `data-metal`.
- **The hook.** The readout row states the payoff of the mechanic: `Hold top 3 → Gold pays
  ×1.25`, and at the top division `Diamond pays ×2 — the ceiling`. This is what ties promotion
  to reward, and it is the addictive half of the ask.
- ⚠ **Never hard-code the ladder.** `division_multiplier` (scalar) and `division_multipliers`
  (the road) both ship in the same leaderboard payload from the same list in
  `tools/gamification/league.py`, so they cannot disagree with each other or with what the
  server actually pays. A hard-coded copy drifts silently the first time the economy is
  retuned, because a wrong multiplier still renders.
- Phone: the road degrades to today's unlabelled pips (the head already carries five children
  in a phone-width column and anything added there must be paid for there); the module stays
  large — it is the thing the user asked to be able to see.

## Testing

**`frontend/tests/league_assert.mjs`** (the gate; currently 115+ assertions across the device
matrix plus a local 1366×768 laptop and a 1920×1080 monitor):

- new: the four blocks (band, filter, deck, ladder) agree on left and right edge within 1px;
- new: `.pod-deck` is struck — computed outline ≥2px, opaque and dark, plus a zero-blur offset
  shadow. This is the check that would have failed all four rejected passes;
- new: the deck carries the promotion statement, and it names the division being climbed to;
- new: the multiplier module is present and above a minimum rendered size at every tier;
- new: the road's five rungs each render their `×N` label above the phone breakpoint;
- changed: fixture `promote_count: 7 → 3` (`pool_size` stays 30, which is what the backend now
  produces);
- new: a **tiny-pool case** — 3 entries, no podium, `promote_count: 2` — so `PromotionZone`,
  `PromotionLine` and `.lg-item[data-promo]` stay gated instead of going dead;
- re-measured, not re-derived: ranks visible at every tier (≥8 / ≥6), chrome ≤250px, plinth
  mass both bounds, base luminance > 0.7, rung dead middle ≤34%, board ≥58% of the field, the
  rhythm ordered.

**Python**: `tests/gamification/test_league.py` promote-count params, and
`tests/api/test_league_endpoints.py:137` (a pool of 17 now promotes 3, not 4). The
`promote_count(pool) < pool` property test must still pass unchanged — it is the guard.

**Full gate before push**: `python -m pytest -q` · `cd frontend && npm run typecheck && npm run
build` · `league_assert` · `aurora_assert` · screenshots at 1920×1080 and 390×844 read by eye,
because the last three passes were each corrected by a screenshot rather than by a number.

## Out of scope

Backend payload shape (unchanged), the peek sheet, the you-bar, the Monday rank-up ceremony
(`.lr-*`), the privacy endpoint, and `public/brand/tiers/*.webp` — still orphaned paid art,
still flagged, still not deleted.
