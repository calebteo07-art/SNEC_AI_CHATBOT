# The League — ARCADE pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine `/leaderboard` within the STRUCK lock so every block shares one edge, the canvas
is vividly coloured at every division, only the podium promotes, and the Lumens multiplier is
readable without opening the (?) sheet.

**Architecture:** One backend rule change (`promote_count`), one pure-TS helper (the next-rung
hook), one new DOM wrapper (`.pod-deck`), and a colour pass over `leaderboard.css`. No payload
change, no migration, no new dependency. Every visual change is gated in
`frontend/tests/league_assert.mjs`, and each visual task writes its assertion FIRST, watches it
fail on the current build, then implements.

**Tech Stack:** FastAPI + pure Python (`tools/gamification/league.py`), Next.js 16 / React 19,
plain CSS (`frontend/src/aurora/leaderboard.css`), Playwright-driven Node harnesses.

**Spec:** `docs/superpowers/specs/2026-08-04-league-arcade-pass-design.md`

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `tools/gamification/league.py` | pure league rules | `promote_count` → `min(n-1, 3)` |
| `tests/gamification/test_league.py` | promote-count params | update + add cap test |
| `tests/api/test_league_endpoints.py` | payload contract | pool-of-17 expectation |
| `frontend/src/aurora/leaderboard/league.ts` | pure board logic | add `nextRungPayoff()` |
| `frontend/tests/league_logic.mjs` | pure-logic gate | tests for the helper |
| `frontend/src/aurora/components/leaderboard/TierBand.tsx` | the head | module + labelled road + hook; clock leaves |
| `frontend/src/aurora/components/leaderboard/Podium.tsx` | the stage | wrap in `.pod-deck` with two flanks |
| `frontend/src/aurora/components/leaderboard/RulesSheet.tsx` | the rules | podium-is-the-cut copy |
| `frontend/src/aurora/components/leaderboard/LeagueRow.tsx` | one rung | `data-role` for the role hue |
| `frontend/src/aurora/screens/Leaderboard.tsx` | the board | pass `divisionName`/`next`/`cohort` down |
| `frontend/src/aurora/leaderboard.css` | all of the above | arena, deck, filter strip, role hues |
| `frontend/tests/league_assert.mjs` | THE gate | 5 new bounds, fixture 7→3, tiny-pool case |
| `docs/design-locks.md` | the lock | ARCADE refine section |

---

### Task 1: Only the podium promotes (backend, pure)

**Files:**
- Modify: `tools/gamification/league.py:76-88`
- Test: `tests/gamification/test_league.py:28-39`
- Test: `tests/api/test_league_endpoints.py:137`

- [ ] **Step 1: Rewrite the failing params**

In `tests/gamification/test_league.py`, replace the `test_promote_count` parametrize block with:

```python
@pytest.mark.parametrize("pool,expected", [
    (0, 0), (1, 0),          # no race
    (2, 1), (3, 2),          # too small for a podium — n-1, so it never promotes everyone
    (4, 3), (7, 3), (12, 3), # the podium, exactly
    (13, 3), (30, 3),        # ⚠ the old rule paid 4 and 7 here; only the podium promotes now
])
def test_promote_count(pool, expected):
    assert promote_count(pool) == expected


def test_promote_count_never_exceeds_the_podium():
    """The stage holds three places, and the stage IS the cut. A fourth promoted student
    would stand below a line the board draws above them."""
    for pool in range(2, 120):
        assert promote_count(pool) <= 3
```

Keep `test_promote_count_always_leaves_someone_behind` exactly as it is — it is the guard that
stops the mechanic from becoming meaningless, and it must pass unchanged.

- [ ] **Step 2: Run it and watch it fail**

```bash
python -m pytest tests/gamification/test_league.py -q
```

Expected: FAIL on `(13, 3)` and `(30, 3)` — `assert 4 == 3`, `assert 7 == 3`.

- [ ] **Step 3: Change the rule**

In `tools/gamification/league.py`, replace the body and docstring of `promote_count`:

```python
def promote_count(pool_size: int) -> int:
    """How many of a pool of `pool_size` move up on Monday: the podium, and only the podium.

    Was ~25% (Duolingo promotes 7 of 30). Changed 2026-08-04 on request — the three students
    on the stage are the three who advance, so the ceremony and the mechanic are the same
    object rather than two overlapping ones.

    Two guards, and both are the whole mechanic:
      · a pool of 1 has no race;
      · the count stays strictly BELOW the pool, so a cohort of 2 or 3 promotes 1 or 2. If
        everyone promotes, the promotion line stops meaning anything.

    Note this only changes behaviour for divisions of 13+ — the old rule already returned 3
    for every pool of 4 to 12. At 30 students it is 10% mobility against Duolingo's 23%:
    a slower climb bought for a much heavier podium."""
    n = int(pool_size or 0)
    if n <= 1:
        return 0
    return min(n - 1, 3)
```

- [ ] **Step 4: Run it and watch it pass**

```bash
python -m pytest tests/gamification/test_league.py -q
```

Expected: PASS.

- [ ] **Step 5: Fix the endpoint contract test**

`tests/api/test_league_endpoints.py:137` asserts `body["promote_count"] == 4` with the comment
`# promote_count(17) would be 5`. Change the value to `3` and the comment to
`# the podium, and only the podium — see league.promote_count`.

- [ ] **Step 6: Run the full backend suite**

```bash
python -m pytest -q
```

Expected: PASS, no new failures.

- [ ] **Step 7: Commit**

```bash
git add tools/gamification/league.py tests/gamification/test_league.py tests/api/test_league_endpoints.py
git commit -m "feat(league): the podium IS the cut — only the top three promote"
```

---

### Task 2: The next-rung hook (pure TS)

The band's readout must state what promotion PAYS, from the server's own ladder. A hard-coded
copy drifts silently the first time the economy is retuned, because a wrong multiplier still
renders.

**Files:**
- Modify: `frontend/src/aurora/leaderboard/league.ts` (append after `promotionLineIndex`)
- Test: `frontend/tests/league_logic.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/league_logic.mjs` (and add `nextRungPayoff` to the import list at
line 14):

```js
// THE HOOK — what the next division pays, from the server's own ladder.
assert.deepStrictEqual(nextRungPayoff(2, [1, 1.1, 1.25, 1.5, 2]), { name: "Gold", mult: "×1.25" });
assert.deepStrictEqual(nextRungPayoff(1, [1, 1.1, 1.25, 1.5, 2]), { name: "Silver", mult: "×1.1" });
// The top division has nothing above it — the caller renders the ceiling instead.
assert.strictEqual(nextRungPayoff(5, [1, 1.1, 1.25, 1.5, 2]), null);
// An older server sends no ladder at all: no hook rather than an invented number.
assert.strictEqual(nextRungPayoff(2, []), null);
// A short ladder must not read past its end.
assert.strictEqual(nextRungPayoff(2, [1, 1.1]), null);
// Trailing zeros make a game number look like a currency.
assert.deepStrictEqual(nextRungPayoff(3, [1, 1.1, 1.25, 1.5, 2]), { name: "Platinum", mult: "×1.5" });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node frontend/tests/league_logic.mjs
```

Expected: FAIL — `nextRungPayoff is not defined`.

- [ ] **Step 3: Implement it**

Append to `frontend/src/aurora/leaderboard/league.ts`:

```ts
/** What the NEXT division pays, or null when there is nothing above you to name.
 *
 *  Read from the server's ladder rather than from a constant here: `division_multiplier` and
 *  `division_multipliers` ship in the same payload from the same list in
 *  tools/gamification/league.py, so they cannot disagree with what a student is actually paid.
 *  A hard-coded copy would drift the first time the economy is retuned — silently, because a
 *  wrong multiplier still renders. */
export function nextRungPayoff(
  division: number, multipliers: number[],
): { name: string; mult: string } | null {
  const next = Math.trunc(division) + 1;
  if (next > TOP_DIVISION) return null;
  const m = multipliers?.[next - 1];
  const name = DIVISION_NAMES[next - 1];
  if (typeof m !== "number" || !name) return null;
  // 1.5, never 1.50 — trailing zeros make a game number look like a currency.
  return { name, mult: `×${m.toFixed(2).replace(/\.?0+$/, "")}` };
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
node frontend/tests/league_logic.mjs
```

Expected: PASS, no output before the final summary line.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/leaderboard/league.ts frontend/tests/league_logic.mjs
git commit -m "feat(league): read the next rung's payoff off the server's own ladder"
```

---

### Task 3: The arena — a fixed vivid field

⚠ This breaks a locked rule on request. The metal WASH stays as the identity layer; the base,
the blooms and the stripes become fixed.

**Files:**
- Modify: `frontend/src/aurora/leaderboard.css:132-157` (the arena) and `:216-229` (the apron)
- Test: `frontend/tests/league_assert.mjs` (the luminance bound already exists — it must still pass)

- [ ] **Step 1: Replace the per-metal canvas**

Replace lines 132–157 with a single fixed field. The metal wash (layer 2) is the ONLY per-metal
declaration that survives:

```css
.aurora-main:has(.lb-climb) {
  /* THE FIELD IS FIXED, 2026-08-04 (sixth pass, on request). It used to wear the viewer's own
     division metal — and at Silver that metal IS grey, so the largest surface in the app
     desaturated at the tier most of the cohort sits in. Identity did not disappear: it moved
     onto the objects (band, podium, road, crest) and onto the WASH below, which still tints
     the top of the page in your own metal, so climbing still visibly re-skins the screen.
     ⚠ Still light (luminance > 0.7, gated), still ends in an OPAQUE solid, still not a dot
     grid, still not the banned sunburst. */
  --arena-base: #FFFBF4;
  --arena-wash: rgba(226, 154, 94, .3);       /* bronze default: a null division still gets a real arena */
  --arena-stripe: rgba(127, 90, 240, .06);    /* the LANE's stripe (§ THE LANE) — one token, one job */
  background:
    radial-gradient(52% 26% at 50% 20%, rgba(255, 255, 255, .92) 0%, rgba(255, 255, 255, 0) 72%),
    radial-gradient(96% 42% at 50% -10%, var(--arena-wash) 0%, rgba(255, 255, 255, 0) 74%),
    radial-gradient(38% 30% at 4% 12%, rgba(255, 122, 156, .22) 0%, rgba(255, 122, 156, 0) 70%),
    radial-gradient(38% 30% at 97% 26%, rgba(63, 208, 232, .24) 0%, rgba(63, 208, 232, 0) 70%),
    radial-gradient(46% 34% at 50% 104%, rgba(255, 196, 63, .26) 0%, rgba(255, 196, 63, 0) 72%),
    repeating-linear-gradient(135deg,
      rgba(127, 90, 240, .055) 0 24px, rgba(255, 255, 255, 0) 24px 48px,
      rgba(27, 158, 186, .055) 48px 72px, rgba(255, 255, 255, 0) 72px 96px,
      rgba(232, 90, 120, .05) 96px 120px, rgba(255, 255, 255, 0) 120px 144px,
      rgba(214, 150, 20, .06) 144px 168px, rgba(255, 255, 255, 0) 168px 192px),
    var(--arena-base);
  background-repeat: no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, repeat, no-repeat;
}
/* The wash is the last per-metal thing on the canvas, and it is deliberate: it is what keeps
   "climbing re-skins the screen" true after the base stopped carrying it. */
.aurora-main:has(.lb-climb[data-metal="silver"]) { --arena-wash: rgba(157, 172, 194, .34); }
.aurora-main:has(.lb-climb[data-metal="gold"]) { --arena-wash: rgba(245, 198, 63, .34); }
.aurora-main:has(.lb-climb[data-metal="platinum"]) { --arena-wash: rgba(169, 178, 232, .34); }
.aurora-main:has(.lb-climb[data-metal="diamond"]) { --arena-wash: rgba(127, 220, 240, .36); }
.aurora-main:has(.lb-climb) .aurora-mesh { display: none; }
```

⚠ `background-repeat` must list **seven** values, one per layer, in order. The stripe layer is
the only `repeat`; miscounting silently tiles a bloom.

- [ ] **Step 2: Fix the apron**

Replace lines 225–229 with a single fixed deep surface (the four per-metal `--arena-deep`
overrides are deleted — the apron is ground, and ground is no longer identity):

```css
.aurora-main:has(.lb-climb) { --arena-deep: #F0E6FA; --lane: 1400px; }
```

- [ ] **Step 3: Run the gate on a wide viewport**

```bash
bash scripts/start-harness.sh aurora
```

Expected: the luminance bound (`the board runs on the light Aurora canvas`) still passes at
every tier, and no `zero rasters` failure — every layer here is a gradient.

- [ ] **Step 4: Screenshot 1920×1080 and look at it**

The field must read as loud and light. If any bloom produces a visible hard edge, lower its
alpha rather than moving it — `.aurora-main` does not scroll, and a hard horizontal edge would
sit still while the ladder slides past it.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/leaderboard.css
git commit -m "feat(league): the arena stops being grey at Silver"
```

---

### Task 4: The multiplier — module, labelled road, next-rung hook

**Files:**
- Modify: `frontend/src/aurora/components/leaderboard/TierBand.tsx`
- Modify: `frontend/src/aurora/screens/Leaderboard.tsx:170-176` (pass `multipliers`)
- Modify: `frontend/src/aurora/leaderboard.css:342-420` (`.tb-pip`, `.tb-mult`, `.tb-readout`)
- Test: `frontend/tests/league_assert.mjs`

- [ ] **Step 1: Write the failing assertions**

In `league_assert.mjs`, inside the `page.evaluate` measurement block, add beside `multChip`:

```js
    /* THE MODULE. A multiplier a student cannot see is an accounting detail, not a reward —
       so this is measured as RENDERED AREA, not as "the element exists". The chip it replaces
       was 44x22 in a band 1148px wide. */
    multBox: (() => {
      const el = document.querySelector('[data-testid="tier-multiplier"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    })(),
    /* THE ROAD, on the page rather than only in the (?) sheet. Above the phone breakpoint
       every rung states what it pays; below it the head cannot afford the labels and the
       pips stay bare. */
    roadLabels: [...document.querySelectorAll(".tb-pip")]
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter((t) => /×/.test(t)).length,
    /* THE HOOK — the payoff of the mechanic, stated where the mechanic is. */
    hookText: (document.querySelector('[data-testid="tier-hook"]')?.textContent || "").trim(),
```

And in the per-viewport check block:

```js
  if (!m.multBox) bad(`${at}: no multiplier module in the band`);
  else if (m.multBox.w * m.multBox.h < 2600) {
    bad(`${at}: the multiplier module renders ${m.multBox.w}x${m.multBox.h} — too small to be the reward it describes`);
  } else ok(`${at}: the multiplier module is ${m.multBox.w}x${m.multBox.h}`);

  if (m.root.w >= 700) {
    if (m.roadLabels !== 5) bad(`${at}: ${m.roadLabels} of 5 rungs state what they pay — a road that hides the prize is a row of dots`);
    else ok(`${at}: all five rungs state what they pay`);
  }

  if (!/×/.test(m.hookText)) bad(`${at}: the band never says what the next division pays`);
  else ok(`${at}: the hook reads "${m.hookText}"`);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
bash scripts/start-harness.sh aurora
```

Expected: FAIL — `no multiplier module` is not it (the chip exists), but
`the multiplier module renders 44.0x22.0 — too small`, `0 of 5 rungs state what they pay`, and
`the band never says what the next division pays`.

- [ ] **Step 3: Restructure the band**

In `TierBand.tsx`: add `multipliers: number[]` to the props, import `nextRungPayoff`, and render
the three pieces below. ⚠ **Leave the clock exactly where it is** — it moves to the deck in Task
5, atomically, because `lb-reset` is asserted and a commit with the clock nowhere on the page
would ship red.

- `.tb-pip` gains a visible `<span className="tb-px">{mult(m)}</span>` child alongside the
  existing `.tb-sr` label, where `mult` is the same trailing-zero formatter `RulesSheet` uses.
  ⚠ `.tb-pip` must keep painting its own metal — `league_assert` samples the five rungs as
  PAINT, and moving the fill onto a child would pass on five grey pips.
- `.tb-mult` becomes a two-line module: `×1.1` over `LUMENS`, keeping
  `data-testid="tier-multiplier"` and its `.tb-sr` sentence.
- the readout gains `<p className="tb-hook" data-testid="tier-hook">`, reading
  `Hold top 3 → {name} pays {mult}` from `nextRungPayoff(division, multipliers)`, or
  `{divisionName} pays {mult} — the ceiling` at the top division.

In `Leaderboard.tsx`, pass `multipliers={data?.division_multipliers ?? []}` to `<TierBand>`.

- [ ] **Step 4: Style it**

In `leaderboard.css`: give `.tb-mult` the medallion lip (3px lip / 2px outline), a hard-stop
gold fill, `--ink-on-gold` for both lines (⚠ `--gold-ink` is 3.0:1 on gold — never on this
surface), and `display: grid` with the `×N` at ~22px/800 over `LUMENS` at ~9px/800 tracking
`.1em`. Give `.tb-px` a 10px/800 label in `--ink-on-gold` on the lit rungs and `--ink-3` on
locked ones. Widen `.tb-pips` gap to 8px and let each pip become a rounded rect wide enough for
its label. In the `max-width: 420px` and landscape-phone blocks, add `.tb-px { display: none; }`
and keep the pips at their current dot size.

- [ ] **Step 5: Run the gate and the typecheck**

```bash
cd frontend && npm run typecheck
```

```bash
bash scripts/start-harness.sh aurora
```

Expected: the three new assertions PASS; ranks-visible still ≥8 at every tier and ≥6 on a
landscape phone. **If a tier drops a rank, the label row is what pays** — shrink `.tb-px`, never
a plinth.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/TierBand.tsx frontend/src/aurora/screens/Leaderboard.tsx frontend/src/aurora/leaderboard.css frontend/tests/league_assert.mjs
git commit -m "feat(league): the multiplier is a module and the road says what it pays"
```

---

### Task 5: The stage deck — one edge, and the clock moves

**Files:**
- Modify: `frontend/src/aurora/components/leaderboard/Podium.tsx`
- Modify: `frontend/src/aurora/screens/Leaderboard.tsx:189-191`
- Modify: `frontend/src/aurora/leaderboard.css` (`.pod` block, all four responsive tiers)
- Test: `frontend/tests/league_assert.mjs`

- [ ] **Step 1: Write the failing assertions**

Add to the measurement block:

```js
    /* ONE EDGE. The complaint was "the cards and elements are not spaced out nicely", and
       the measurement behind it is four different widths on four different centres: at 1500+
       a 1148px band, a ~470px filter, a 700px stage and a 1148px ladder. Blocks that do not
       share an edge cannot look deliberate however carefully each one is spaced. */
    edges: (() => {
      const sel = [".tb", ".lb-filter", '[data-testid="podium"]', ".lg-list"];
      const rs = sel.map((s) => document.querySelector(s)).filter(Boolean)
        .map((el) => el.getBoundingClientRect());
      if (rs.length < 3) return null;
      const l = rs.map((r) => r.left), rt = rs.map((r) => r.right);
      return {
        n: rs.length,
        spreadL: +(Math.max(...l) - Math.min(...l)).toFixed(1),
        spreadR: +(Math.max(...rt) - Math.min(...rt)).toFixed(1),
      };
    })(),
```

And in the check block (⚠ guarded to the STACKED layouts — the landscape-phone tier puts the
ladder in a second column on purpose, so it cannot share the stage's edge):

```js
  if (!m.edges) bad(`${at}: could not measure the column's edges`);
  else if (m.rhythm && !m.rhythm.stacked) ok(`${at}: two columns — the shared-edge bound does not apply`);
  else if (m.edges.spreadL > 1.5 || m.edges.spreadR > 1.5) {
    bad(`${at}: the ${m.edges.n} stacked blocks disagree on their edges by ${m.edges.spreadL}px left / ${m.edges.spreadR}px right — four widths on four centres is what "not spaced out nicely" measures as`);
  } else ok(`${at}: all ${m.edges.n} blocks share one edge (±${m.edges.spreadL}/${m.edges.spreadR}px)`);
```

Extend the existing struck-material check so `.pod-deck` is measured alongside `.pod-block`,
`.lg-list` and `.tb` — computed `border-width ≥2px`, opaque and dark, plus a zero-blur offset
shadow. Add one more:

```js
  if (!/PROMOTE/i.test(m.deckText)) bad(`${at}: the stage never says the three students on it are the ones who advance`);
  else ok(`${at}: the stage states the promotion`);
```

with `deckText: (document.querySelector(".pod-deck")?.textContent || "").trim()` in the
measurement block.

- [ ] **Step 2: Run it and watch it fail**

```bash
bash scripts/start-harness.sh aurora
```

Expected: FAIL — `the 4 stacked blocks disagree on their edges by …px`, and
`the stage never says the three students on it are the ones who advance`.

- [ ] **Step 3: Wrap the stage in a deck**

In `Podium.tsx`, add props `promoteTo: string | null` and `clock: string | null`, and wrap the
existing `<section className="pod">` in:

```tsx
<section className="pod-deck" data-testid="podium" aria-label="The top three this week">
  <p className="pod-banner" data-promo={places.some((e) => e.rank <= promoteCount) || undefined}>
    <span className="pod-banner-ico" aria-hidden>▲</span>
    {promoteTo ? <>Top {promoteCount} promote to <b>{promoteTo}</b></> : `Top ${promoteCount} promote`}
  </p>
  <div className="pod">{/* floor + the three slots, unchanged */}</div>
  {clock && <span className="pod-clock" data-testid="lb-reset"><span className="tb-dot" aria-hidden />Closes in {clock}</span>}
</section>
```

⚠ `data-testid="podium"` moves to the deck: it is the stage now, and the rhythm gate measures
the stage as one block. `data-testid="podium-slot"` stays on each `<article>`, so every
place-level assertion is untouched. Drop the `aria-label` from the inner `.pod`.

The clock's `useEffect` moves from `TierBand.tsx` into `Leaderboard.tsx` (one owner, two
consumers is worse than one owner passing a string down), and `Leaderboard.tsx` renders
`<Podium … promoteTo={next} clock={left} />`.

- [ ] **Step 4: Style the deck**

```css
/* THE DECK. The stage used to be a 700px island inside a 1148px board, with ~224px of dead
   flank either side of it — the largest piece of "not spaced out nicely" on the page. The
   blocks do NOT grow to fill it: past ~700px of stage the champion becomes a 2:1 slab, which
   is the bar-chart shape the STRUCK pass exists to prevent and which the mass bound gates
   one-sidedly. So the PLATFORM widens to the board's edge and the flanks carry the two facts
   that were homeless — what the stage means, and how long is left. */
.pod-deck {
  position: relative; box-sizing: border-box;
  border: var(--mat-out) solid var(--mat-ink);
  border-radius: 18px;
  background-color: #FFF6E6;
  background-image: linear-gradient(180deg,
    #FFFFFF 0%, #FFFFFF 15%, #FFF6E6 15.01%, #FFF6E6 70%, #FBE9C6 70.01%, #FBE9C6 100%);
  box-shadow:
    0 var(--mat-lip) 0 0 #D9BE8A,
    0 var(--mat-lip) 0 var(--mat-out) var(--mat-ink),
    0 calc(var(--mat-lip) + 8px) 14px -5px rgba(42, 31, 61, .3);
  display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: end; gap: 10px; padding: 10px 14px 0;
  margin: 9px 0 7px;
}
```

`.pod` loses its own `margin` (the deck owns the rhythm now) and keeps `width: min(…, 100%)`
plus `justify-self: center` in the middle track. `.pod-banner` is a struck gold pill at the
pill tier (2px lip / 1.5px→**2px** outline — ⚠ 1.5px renders as 1px at DPR 1, which is the
hairline the recipe bans), `--ink-on-gold` text, `align-self: end`, `margin-bottom: 14px`.
`.pod-clock` mirrors it in `--chip-*`, right-aligned via `justify-self: end`.

In `@media (max-width: 700px)` and the landscape-phone tier: `.pod-deck` becomes one column,
the banner and clock share a bottom caption row (`grid-template-columns: 1fr auto`,
`grid-template-areas` with the stage first), and the padding drops to `8px 10px 0`.

- [ ] **Step 5: Run the gate**

```bash
bash scripts/start-harness.sh aurora
```

Expected: the edge bound and the deck's struck-material bound PASS. **Ranks visible must still
be ≥8 / ≥6.** The deck costs ~8px; the clock leaving the band's readout pays most of it back.
If 1366×768 drops to 7, take the difference out of `.pod-deck`'s padding, never out of a plinth
— the mass bound is the one that caught a regression introduced in its own session.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/Podium.tsx frontend/src/aurora/screens/Leaderboard.tsx frontend/src/aurora/components/leaderboard/TierBand.tsx frontend/src/aurora/leaderboard.css frontend/tests/league_assert.mjs
git commit -m "feat(league): the stage stands on a full-width deck, and the page has one edge"
```

---

### Task 6: The filter strip

**Files:**
- Modify: `frontend/src/aurora/screens/Leaderboard.tsx:178-187`
- Modify: `frontend/src/aurora/leaderboard.css:628-650` and the desktop tiers

- [ ] **Step 1: Make it full-width with content at both ends**

⚠ `.lb-filter` and `.lb-chip` are load-bearing class names — `league_assert` clicks
`.lb-filter .lb-chip:has-text(...)` and a rename crashes the run. Restyle in place.

In `Leaderboard.tsx`, wrap the chips in `<div className="lb-chips" role="tablist">` inside
`.lb-filter`, and add `<span className="lb-count">{data?.pool_size ?? 0} in your division</span>`
after it. Move `role="tablist"`/`aria-label` onto `.lb-chips` so the tablist still contains only
tabs.

In CSS: `.lb-filter` becomes `display: flex; justify-content: space-between; align-items: center;
gap: 10px; width: 100%` with the strip's own struck medallion treatment; the chips keep their
current size inside it. **Delete** `align-self: center; width: fit-content; min-width: 340px`
from the ≥1024 tier and `min-width: 420px` from the ≥1500 tier — those exist to centre a
floating pill and are exactly what breaks the shared edge.

- [ ] **Step 2: Run the gate**

```bash
bash scripts/start-harness.sh aurora
```

Expected: the shared-edge bound now counts 4 blocks and passes; the rhythm bound
(`bandToFilter < filterToStage`) still passes; the role-filter click test still passes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/screens/Leaderboard.tsx frontend/src/aurora/leaderboard.css
git commit -m "feat(league): the role filter is a strip on the board's edge, not a floating pill"
```

---

### Task 7: Colour on the objects — role hues, the gauge, the ember

**Files:**
- Modify: `frontend/src/aurora/components/leaderboard/LeagueRow.tsx:35-65`
- Modify: `frontend/src/aurora/leaderboard.css` (`.lg-role`, `.lg-streak`, `.lg-bar`, `.lb-chip`)
- Test: `frontend/tests/league_assert.mjs`

- [ ] **Step 1: Write the failing assertion**

```js
    /* COLOUR ON THE OBJECTS. A vivid field behind a grey ladder is still a grey ladder: the
       27 gauges were one graphite, which made the most-repeated object on the page the
       flattest. Role is identity, so the ladder can carry it — sampled as PAINT. */
    gaugeHues: (() => {
      const bars = [...document.querySelectorAll(".lg-row:not([data-you]) .lg-bar")];
      const hues = new Set(bars.map((el) => getComputedStyle(el, "::before").backgroundColor));
      return { bars: bars.length, hues: hues.size };
    })(),
```

```js
  if (m.root.w >= 700) {
    if (m.gaugeHues.bars >= 3 && m.gaugeHues.hues < 2) {
      bad(`${at}: ${m.gaugeHues.bars} gauges paint ${m.gaugeHues.hues} colour — the ladder is the flattest thing on a page that is meant to be loud`);
    } else ok(`${at}: the gauges paint ${m.gaugeHues.hues} role colours across ${m.gaugeHues.bars} rungs`);
  }
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `7 gauges paint 1 colour`.

- [ ] **Step 3: Carry the role onto the row**

In `LeagueRow.tsx`, add `data-role={e.role || undefined}` to the `<li className="lg-item">`.

In CSS, define the three hues once on `.lb-climb` and consume them by attribute:

```css
/* ROLE IS IDENTITY, so the ladder is allowed to wear it — the same rule that lets the band
   wear a metal, spent on the object that repeats 27 times. Fill only: never an outline and
   never a lip, so role can never out-shout the promotion gold on the deck. */
  --role-oa: #7F5AF0;
  --role-ot: #1B9EBA;
  --role-psa: #E8577A;
```

```css
.lg-item[data-role="OA"] { --role: var(--role-oa); }
.lg-item[data-role="OT"] { --role: var(--role-ot); }
.lg-item[data-role="PSA"] { --role: var(--role-psa); }
.lg-bar::before { background: var(--role, #6E7378); }
```

⚠ Order matters — the two overrides that already exist must stay BELOW this rule and keep
winning: `.lg-item[data-promo] .lg-bar::before` (gold, the cut) and `.lg-row[data-you] .lg-bar::before`
(you-blue). Verify by reading the file, not by assuming.

`.lg-role` takes `color: var(--role)`; `.lg-streak` takes the Forge ember `#D2601A` and its
existing weight. `.lb-chip[data-on="true"]` keeps its current dark fill — the filter is a
control, and colouring the ON state by role would make the selected chip look like a row.

- [ ] **Step 4: Run the gate and read the contrast sweep**

```bash
bash scripts/start-harness.sh aurora
```

Expected: PASS, and **no new contrast failure** — `.lg-role` is 11px/800 text, so each hue must
clear 4.5:1 on the row's white. If one fails, darken the token; do not shrink the type.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/LeagueRow.tsx frontend/src/aurora/leaderboard.css frontend/tests/league_assert.mjs
git commit -m "feat(league): the ladder wears its roles, and the gauges stop being one grey"
```

---

### Task 8: Re-gate the promotion mechanic

The fixture still describes the old economy, and under the new rule the ladder's promotion zone
no longer renders on a normal board — so the styles that draw it need a case that still reaches
them, or they become untested dead paint.

**Files:**
- Modify: `frontend/tests/league_assert.mjs:78, 108, 111`
- Modify: `frontend/tests/aurora_assert.mjs:808` (only if its `promote_count` disagrees with the backend)

- [ ] **Step 1: Correct the fixture**

At line 108 set `promote_count: 3` (leave `pool_size: 30` — that is what the backend now
returns for a pool of 30), and rewrite the comment at line 78 to say the podium is the cut.
`PROMOTE` at line 111 already derives from the fixture and needs no change.

- [ ] **Step 2: Add the tiny-pool case**

Beside the existing single-student case at line ~909, add a board of **3 entries with
`promote_count: 2`**. Below three entries `splitPodium` refuses the stage, so this is the one
shape that still renders `PromotionZone`, `PromotionLine` and `.lg-item[data-promo]`:

```js
  /* THE UNDERFILLED STAGE — the only board that still draws the promotion zone in the
     LADDER now that the podium is the cut. Without this case the zone, the line and the gold
     rows would keep their CSS and lose their gate: paint nothing ever measures again. */
  await mock(p, { ...BOARD, entries: BOARD.entries.slice(0, 3), pool_size: 3, promote_count: 2 });
  await p.reload({ waitUntil: "networkidle" });
  if (await p.locator('[data-testid="podium"]').count() !== 0) bad("a three-student cohort rendered a stage");
  else ok("below three entries there is no stage");
  if (await p.locator('[data-testid="promotion-line"]').count() !== 1) bad("no cut on an underfilled board");
  else ok("the cut still draws when the podium is withheld");
  if (await p.locator('.lg-item[data-promo]').count() !== 2) bad("the underfilled board does not mark its promoted rows");
  else ok("the underfilled board marks both promoted rows");
```

- [ ] **Step 3: Run the whole gate**

```bash
bash scripts/start-harness.sh all
```

Expected: every assertion passes, including the unfiltered-board cut, the filtered-view
withholding, and the new tiny-pool case.

- [ ] **Step 4: Update the rules copy**

In `RulesSheet.tsx`, replace the third bullet with:

```tsx
          <li>
            <strong>The podium is the cut.</strong> Finish in the top three and you move up a
            division on Monday — the three students on the stage are the three who advance.
          </li>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/league_assert.mjs frontend/src/aurora/components/leaderboard/RulesSheet.tsx
git commit -m "test(league): gate the podium-only cut, and keep the underfilled board measured"
```

---

### Task 9: Verify, lock, ship

- [ ] **Step 1: Run every gate**

```bash
python -m pytest -q
```

```bash
cd frontend && npm run typecheck && npm run build
```

```bash
bash scripts/start-harness.sh all
```

⚠ A zero exit only means "nothing that ran failed" — **count the harnesses (21)**. A starved box
invents believable defects; if anything looks wrong, re-run on `HARNESS_PORT=3999` before
believing it.

- [ ] **Step 2: Screenshot and look**

1920×1080 and 390×844. The last three passes on this surface were each corrected by a
screenshot rather than by a number. Check: one edge down the page, no grey field, the module
legible at arm's length, the deck reading as a platform rather than as a fourth card.

- [ ] **Step 3: Write the lock refine**

Add an `#### ARCADE 2026-08-04 — the sixth pass` section to `docs/design-locks.md` under The
League, naming the four changed criteria (the fixed field, the gauge's role hue, the shared
edge, podium-only promotion), the new gated bounds, and the defects this pass fixed.

- [ ] **Step 4: Check CI, not just the local gates**

```bash
git push origin main
```

```bash
gh run list --branch main --limit 3
```

⚠ `cancelled` is not a pass — read the jobs.
