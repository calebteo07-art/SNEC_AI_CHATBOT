# Cohort-wide League Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The League board lists the whole cohort with a league chip on every row, while the weekly promotion race stays inside each division.

**Architecture:** The server stops scoping `rank_entries` to the viewer's division and ranks everyone together — a code path that already exists (the pre-migration-016 fallback). `pool_size` / `promote_count` keep describing the viewer's own division and now feed the head instead of the list. The client derives the league standing from the cohort list with one new pure helper, `leagueRanks`, which works because the cohort sort key `(-xp, name.lower())` is the same key the division sort used, so filtering preserves relative order.

**Tech Stack:** FastAPI + pytest (backend), Next.js 16 / React 19 + Node harnesses run under `--experimental-strip-types` (frontend).

Design spec: `docs/superpowers/specs/2026-08-08-cohort-wide-league-board-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `tools/api/routers/student.py` | `/api/leaderboard` wiring | Rank the cohort; cohort-wide daily snapshot |
| `tools/gamification/league.py` | League rules (pure) | Comment correction only — no behaviour |
| `frontend/src/aurora/leaderboard/league.ts` | Client league math (pure) | Add `leagueRanks`; delete `promotionLineIndex` |
| `frontend/src/aurora/components/leaderboard/LeagueRow.tsx` | One rung | Add league chip; delete `PromotionZone` + `PromotionLine` |
| `frontend/src/aurora/components/leaderboard/TierBand.tsx` | Board head | Add the league standing line |
| `frontend/src/aurora/components/leaderboard/Podium.tsx` | The stage | Cohort caption; `promoSet` replaces `promoteCount`/`promoteTo` |
| `frontend/src/aurora/screens/Leaderboard.tsx` | Composition | Derive league standing + promo set; drop `lineAt`/`showCut` |
| `frontend/src/aurora/leaderboard.css` | Board styling | `.lg-league`, `.chase-st`; drop `.lg-zone` / `.lg-cut` |
| `docs/design-locks.md` | Settled UI | Record the refined criterion |

**Ordering:** Tasks 1–2 (backend) are independent of 3–7 (frontend). Task 7 depends on 3, 4, 5 and 6.

---

### Task 1: The board ranks the cohort

**Files:**
- Modify: `tools/api/routers/student.py:681-684`
- Modify: `tools/gamification/league.py:41-48` (comment only)
- Test: `tests/api/test_leaderboard_endpoint.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/api/test_leaderboard_endpoint.py`:

```python
DIVIDED = [
    {"student_id": "user_001", "xp": 300, "xp_week": 300, "role": "OA", "division": 2},
    {"student_id": "user_002", "xp": 900, "xp_week": 900, "role": "OT", "division": 2},
    {"student_id": "user_101", "xp": 520, "xp_week": 520, "role": "OT", "division": 1},
    {"student_id": "user_102", "xp": 474, "xp_week": 474, "role": "PSA", "division": 1},
]
DIVIDED_CONSENT = [
    {"student_id": "user_001", "student_name": "Ann Aa"},
    {"student_id": "user_002", "student_name": "Bob Bb"},
    {"student_id": "user_101", "student_name": "Nia Nn"},
    {"student_id": "user_102", "student_name": "Rae Rr"},
]


@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=False)
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=DIVIDED_CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
       return_value=DIVIDED)
def test_leaderboard_shows_every_division_to_any_viewer(mock_p, mock_c, mock_seal):
    """THE REPORTED BUG (2026-08-07): a batch onboarded into Ember was invisible to a viewer
    already promoted to Volt, because the board only ever ranked the viewer's own division.
    The board is now the whole cohort — ranked together, in one list."""
    for viewer in ("user_001", "user_101"):
        body = client.get("/api/leaderboard", cookies=_cookies(viewer)).json()
        assert [e["name"] for e in body["entries"]] == \
            ["Bob Bb", "Nia Nn", "Rae Rr", "Ann Aa"]
        assert [e["rank"] for e in body["entries"]] == [1, 2, 3, 4]
        # Each row still carries its own league, which is what the chip renders.
        assert [e["division"] for e in body["entries"]] == [2, 1, 1, 2]


@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=False)
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=DIVIDED_CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
       return_value=DIVIDED)
def test_leaderboard_pool_and_promote_stay_division_scoped(mock_p, mock_c, mock_seal):
    """The LIST is the cohort; the RACE is not. pool_size/promote_count must keep describing
    the viewer's own division or the head would promise a promotion the rollover never awards."""
    body = client.get("/api/leaderboard", cookies=_cookies("user_001")).json()
    assert body["division"] == 2
    assert body["pool_size"] == 2            # Volt only, NOT the 4-person cohort
    assert body["promote_count"] == 1        # promote_count(2) == min(2-1, 3)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
python -m pytest tests/api/test_leaderboard_endpoint.py -q -k "every_division or division_scoped"
```

Expected: `test_leaderboard_shows_every_division_to_any_viewer` FAILS — the `user_001` pass returns only `["Bob Bb", "Ann Aa"]` and the `user_101` pass only `["Nia Nn", "Rae Rr"]`. `test_leaderboard_pool_and_promote_stay_division_scoped` should already PASS (it pins behaviour that must not change).

- [ ] **Step 3: Rank the cohort**

In `tools/api/routers/student.py`, replace the `rank_entries` call at line 683-684:

```python
    # THE LIST IS THE COHORT (2026-08-08). It used to be `division=my_division`, and that is
    # exactly how a batch of students who onboarded into Ember became invisible to everyone
    # already promoted out of it — two groups on two boards, neither able to see the other.
    # `division=None` ranks everyone together; each entry still carries its own `division`, so
    # the row can wear a league chip and the head can still find the viewer's own race below.
    entries = rank_entries(profiles, names, viewer_id=student_id, role=role or None,
                           today=today, week_start=week_start, division=None)
```

`my_division` is still computed on the line above and still used for `pool`, `promote_count` and the response fields — leave all of that alone.

- [ ] **Step 4: Correct the comment the change falsifies**

In `tools/gamification/league.py`, replace the first bullet of the `DIVISION_MULTIPLIERS` rationale (line ~42):

```python
#   · A student is ranked against the whole cohort on the BOARD (2026-08-08), but promotion is
#     decided strictly within a division — so a multiplier still cannot buy a promotion. What it
#     does buy is a higher position on the shared list, which is disclosed by the league chip on
#     every row and by the trophy road in the rules sheet. That was an explicit product call:
#     see docs/superpowers/specs/2026-08-08-cohort-wide-league-board-design.md.
```

- [ ] **Step 5: Run the full leaderboard + league suites**

```bash
python -m pytest tests/api/test_leaderboard_endpoint.py tests/api/test_league_endpoints.py tests/gamification/ -q
```

Expected: all pass. If `test_leaderboard_ranks_everyone_excludes_hidden` or the role-filter test fail, they were relying on division scoping — read them before changing them; their fixtures carry no `division` key, so `league_ready` is False and they should be unaffected.

- [ ] **Step 6: Commit**

```bash
git add tools/api/routers/student.py tools/gamification/league.py tests/api/test_leaderboard_endpoint.py
git commit -m "fix(league): the board lists the whole cohort, not just your division"
```

---

### Task 2: The daily rank snapshot becomes cohort-wide

**Files:**
- Modify: `tools/api/routers/student.py:699-705`
- Test: `tests/api/test_leaderboard_endpoint.py`

- [ ] **Step 1: Write the failing test**

```python
@patch("tools.shared.db.set_rank_prev_bulk", new_callable=AsyncMock)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=DIVIDED_CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
       return_value=DIVIDED)
def test_daily_snapshot_stamps_cohort_ranks(mock_p, mock_c, mock_seal, mock_bulk):
    """rank_delta compares the live rank against this snapshot. The live rank is now cohort-wide,
    so the snapshot must be too — a per-division stamp would render a student who is #1 in Ember
    and #2 overall as having DROPPED a place without moving."""
    r = client.get("/api/leaderboard", cookies=_cookies("user_001"))
    assert r.status_code == 200
    assert mock_bulk.await_count == 1
    snapshot = mock_bulk.await_args.args[0]
    # Nia is #1 in Ember but #2 across the cohort. The cohort number is what gets stamped.
    assert snapshot == {"user_002": 1, "user_101": 2, "user_102": 3, "user_001": 4}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
python -m pytest tests/api/test_leaderboard_endpoint.py -q -k cohort_ranks
```

Expected: FAIL — the per-division loop stamps `{"user_002": 1, "user_001": 2, "user_101": 1, "user_102": 2}`, so Nia and Rae carry 1 and 2 instead of 2 and 3.

- [ ] **Step 3: Replace the per-division loop with one cohort pass**

In `tools/api/routers/student.py`, replace the snapshot block inside `if await db.take_seal(...)`:

```python
        if await db.take_seal(f"day:{today.isoformat()}"):
            # ONE COHORT-WIDE PASS (2026-08-08). This looped per division while the board was
            # division-scoped; now that the live rank is cohort-wide the snapshot must be on the
            # same scale, or every arrow compares two different numbering systems. `entries` is
            # already exactly this ranking, so re-ranking here would be a second source of truth.
            snapshot = {e["student_id"]: e["rank"] for e in entries}
            background.add_task(db.set_rank_prev_bulk, snapshot, today.isoformat())
```

⚠ Only correct on the UNFILTERED read. Guard it — a `?role=` view would stamp ranks renumbered within one role:

```python
        if role is None and await db.take_seal(f"day:{today.isoformat()}"):
```

Move the `role is None` check FIRST so a filtered read never burns the seal.

- [ ] **Step 4: Verify**

```bash
python -m pytest tests/api/test_leaderboard_endpoint.py -q
```

Expected: all pass.

- [ ] **Step 5: Add the filtered-read guard test**

```python
@patch("tools.shared.db.set_rank_prev_bulk", new_callable=AsyncMock)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=DIVIDED_CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
       return_value=DIVIDED)
def test_filtered_read_never_stamps_the_snapshot(mock_p, mock_c, mock_seal, mock_bulk):
    """A role view renumbers from 1. Stamping from it would write a rank that exists on no
    board — and burning the day's seal would stop the real snapshot from ever running."""
    client.get("/api/leaderboard?role=OT", cookies=_cookies("user_001"))
    assert mock_bulk.await_count == 0
    assert mock_seal.await_count == 0        # the seal is not even taken
```

```bash
python -m pytest tests/api/test_leaderboard_endpoint.py -q -k never_stamps
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/api/routers/student.py tests/api/test_leaderboard_endpoint.py
git commit -m "fix(league): stamp the daily rank snapshot on the cohort scale"
```

---

### Task 3: `leagueRanks` — the client's league slice

**Files:**
- Modify: `frontend/src/aurora/leaderboard/league.ts`
- Test: `frontend/tests/league_logic.mjs`

- [ ] **Step 1: Write the failing test**

Add to `frontend/tests/league_logic.mjs` (and add `leagueRanks` to the import list at the top, removing `promotionLineIndex` in Task 6):

```js
// ── the LEAGUE SLICE: the race, derived from the cohort list ──
// The board ranks everyone together; the head still has to show the viewer's own division
// race. This is only sound because the cohort sort key is the SAME key the division sort
// used, so filtering a ranked cohort preserves relative order — no re-sorting here.
{
  const cohort = [
    { rank: 1, division: 2, xp: 900, name: "Bob", is_you: false },
    { rank: 2, division: 1, xp: 520, name: "Nia", is_you: false },
    { rank: 3, division: 1, xp: 474, name: "Rae", is_you: true },
    { rank: 4, division: 2, xp: 300, name: "Ann", is_you: false },
    { rank: 5, division: 1, xp: 50, name: "Wan", is_you: false },
  ];
  const ember = leagueRanks(cohort, 1);
  assert.strictEqual(ember.size, 3);
  assert.strictEqual(ember.get(cohort[1]), 1);   // Nia: #2 overall, #1 in Ember
  assert.strictEqual(ember.get(cohort[2]), 2);   // Rae: #3 overall, #2 in Ember
  assert.strictEqual(ember.get(cohort[4]), 3);   // Wan: #5 overall, #3 in Ember
  assert.strictEqual(ember.get(cohort[0]), undefined);  // Volt is not in this race
  // Keyed by the ENTRY OBJECT, never by name: two students can share a display name, and
  // `student_id` is deliberately stripped from the payload.
  assert.strictEqual(leagueRanks(cohort, 2).get(cohort[3]), 2);
  assert.strictEqual(leagueRanks(cohort, 5).size, 0);   // nobody at the summit yet

  // The renumbered slice is what computeChase consumes, and its rank must be the LEAGUE
  // rank — feeding it cohort ranks would compare "#3" against a promote count of 3 and
  // tell a student who leads their own division that they are outside the zone.
  const ranks = leagueRanks(cohort, 1);
  const slice = cohort.filter((e) => ranks.has(e)).map((e) => ({ ...e, rank: ranks.get(e) }));
  assert.deepStrictEqual(slice.map((e) => e.rank), [1, 2, 3]);
  const chase = computeChase(slice, 1, false);
  assert.strictEqual(chase.kind, "promote");
  assert.strictEqual(chase.value, 46);          // Rae (#2, 474) chases Nia's 520
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --experimental-strip-types frontend/tests/league_logic.mjs
```

Expected: FAIL — `SyntaxError: The requested module '../src/aurora/leaderboard/league.ts' does not provide an export named 'leagueRanks'`.

- [ ] **Step 3: Implement**

Add to `frontend/src/aurora/leaderboard/league.ts`:

```ts
/** Every entry sitting in `division`, mapped to its rank WITHIN that division (1-based).
 *
 *  The board lists the whole cohort (2026-08-08) but promotion is still decided inside a
 *  division, so the head needs the viewer's league standing out of a cohort-ranked list.
 *  This is a filter and a counter rather than a sort, and that is load-bearing: the cohort
 *  is ranked by `(-xp, name.lower())`, which is the same key the division ranking used, so
 *  the filtered order IS the division order. Re-sorting here would invite the two to drift.
 *
 *  Keyed by the ENTRY OBJECT. Not by name — two students can share a display name — and not
 *  by id, which the payload deliberately strips before it leaves the server. Callers must
 *  therefore pass the same array instances they render.
 *
 *  ⚠ Only meaningful on an UNFILTERED board. A `?role=` view carries one role's members, so
 *  the counter would number a lens rather than a race; the screen withholds everything built
 *  on this in that case. */
export function leagueRanks<T extends { division: number }>(
  entries: T[], division: number,
): Map<T, number> {
  const ranks = new Map<T, number>();
  let n = 0;
  for (const e of entries) if (e.division === division) ranks.set(e, ++n);
  return ranks;
}
```

- [ ] **Step 4: Verify**

```bash
node --experimental-strip-types frontend/tests/league_logic.mjs
```

Expected: exits 0, no output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/leaderboard/league.ts frontend/tests/league_logic.mjs
git commit -m "feat(league): derive the division race from the cohort list"
```

---

### Task 4: The league chip on every row

**Files:**
- Modify: `frontend/src/aurora/components/leaderboard/LeagueRow.tsx`
- Modify: `frontend/src/aurora/leaderboard.css`

- [ ] **Step 1: Add the chip to the row**

In `LeagueRow.tsx`, extend the import and add the chip as the first item of `.lg-sub`:

```tsx
import { arrowFor, DIVISION_NAMES, TOP_DIVISION } from "@/aurora/leaderboard/league";
import { TIERS } from "./Tiers";
```

```tsx
          <span className="lg-sub">
            {/* THE LEAGUE CHIP (2026-08-08). The list is the whole cohort now, so a row has to
                say which race it belongs to — otherwise the board reads as one ladder whose
                promotion line lands in an arbitrary place. Tinted by data-tier off the same
                hue tokens the band and the pips use; fill and ink only, never an outline or a
                lip, so it can never out-shout the promotion gold (same rule as data-role). */}
            <span className="lg-league" data-tier={TIERS[tierIdx]}>{leagueName}</span>
            {e.role && <span className="lg-role">{e.role}</span>}
            <span className="lg-lvl">Lv {e.level}</span>
            {e.streak_days > 0 && <span className="lg-streak">{e.streak_days}d</span>}
          </span>
```

Derive both above the `return`, beside `pct`:

```tsx
  // Clamped exactly as nextDivisionName clamps: a null or out-of-range column must render a
  // chip, never crash a row.
  const tierIdx = Math.max(0, Math.min(TOP_DIVISION - 1, Math.trunc(Number(e.division) || 1) - 1));
  const leagueName = DIVISION_NAMES[tierIdx];
```

Extend the row's `aria-label` so the chip is not sighted-only:

```tsx
        aria-label={`${e.name}, ${leagueName} league, rank ${e.rank}, ${e.xp.toLocaleString()} Lumens this week. ${mv.label}.`}
```

- [ ] **Step 2: Style it**

In `frontend/src/aurora/leaderboard.css`, beside the existing `.lg-role` rule:

```css
/* The league chip. Reads as a label, not as a second promotion state: the tier hue is spent
   on INK over a low-alpha wash of itself, so it never competes with the gold fill a promoted
   row carries. --tier-ink / --tier-fill are the same tokens the band's pips index. */
.lg-league {
  font-weight: 650;
  font-size: .68rem;
  letter-spacing: .02em;
  text-transform: uppercase;
  padding: .1rem .34rem;
  border-radius: .3rem;
  color: var(--tier-ink);
  background: color-mix(in srgb, var(--tier-ink) 14%, transparent);
}
```

If `--tier-ink` / `--tier-fill` are not the token names used by `[data-tier]` in this file, read the existing `[data-tier]` block and use whatever it already defines — do not invent a second token set.

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: no errors. (`node_modules` must be present — see the worktree note in CLAUDE.md.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/LeagueRow.tsx frontend/src/aurora/leaderboard.css
git commit -m "feat(league): put the league on every row"
```

---

### Task 5: The league standing line in the head

**Files:**
- Modify: `frontend/src/aurora/components/leaderboard/TierBand.tsx`
- Modify: `frontend/src/aurora/leaderboard.css`

- [ ] **Step 1: Add the `standing` prop**

⚠ It goes INSIDE `.tb-chase`, not as a third item in `.tb-readout`. The readout is a two-item strip and the clock was moved out to the podium deck in 2026-08-04 precisely because it had gained a third item.

Add to the props type:

```tsx
  /** The viewer's standing in their OWN division — the race, which the cohort list no longer
   *  shows (2026-08-08). Null when there is no honest one: a role-filtered view, or a hidden
   *  viewer with no row of their own. */
  standing?: { rank: number; pool: number; name: string } | null;
```

Destructure it (`standing = null`) and render it as the chase line's eyebrow:

```tsx
        <p className="tb-chase" data-testid="chase" data-kind={chase.kind}>
          {standing && (
            <span className="chase-st" data-testid="league-standing">
              #{standing.rank} of {standing.pool} in {standing.name}
            </span>
          )}
          {chase.value !== null && <span className="chase-n" ref={ref}>{display}</span>}
          <span className="chase-l">{chase.label}</span>
        </p>
```

- [ ] **Step 2: Style it**

```css
/* The eyebrow above the chase number: the viewer's position in their own division. The list
   below is the whole cohort and carries a different rank, so this states its scope in the
   line itself ("in Volt") — an unqualified second number would read as a contradiction. */
.chase-st {
  display: block;
  font-size: .72rem;
  font-weight: 650;
  opacity: .78;
  margin-bottom: .1rem;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: no errors — `standing` is optional, so `Leaderboard.tsx` still compiles before Task 7 wires it.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/TierBand.tsx frontend/src/aurora/leaderboard.css
git commit -m "feat(league): state your division standing in the head"
```

---

### Task 6: The podium becomes the cohort podium

**Files:**
- Modify: `frontend/src/aurora/components/leaderboard/Podium.tsx`

⚠ **The banner copy is BUDGETED, not chosen.** Podium.tsx documents that on a 360px phone the two banner spans share one nowrap caption row with the clock, that the shipped promotion pill measures 167.2px there, and that a rejected alternative at 187.8px left only 8px. The replacement below is shorter than both (`"Top 3"` + `" this week"` ≈ 118px at the same weight), so it costs the caption row nothing. **Any different wording must be measured at 360 before it ships.**

- [ ] **Step 1: Replace `promoteCount`/`promoteTo` with `promoSet`**

```tsx
export function Podium({ places, promoSet, clock, onPeek, youRef }: {
  places: LeaderboardEntry[];
  /** Entries sitting in THEIR OWN division's promotion zone, by object identity (see
   *  league.ts::leagueRanks). A cohort podium mixes leagues, so "is this student promoting"
   *  can no longer be read off a rank — a #2 overall may be #5 in a crowded division. */
  promoSet: Set<LeaderboardEntry>;
  clock: string | null;
  onPeek: (e: LeaderboardEntry) => void;
  youRef?: (el: HTMLElement | null) => void;
}) {
```

- [ ] **Step 2: Rewrite the banner**

The whole `{(promoteCount > 0 || promoteTo === null) && (...)}` block — including the summit branch, which was a special case of a promotion claim this stage no longer makes — becomes unconditional (`splitPodium` already guarantees three filled places):

```tsx
      {/* WHAT THIS STAGE IS (2026-08-08). It used to read "Top N promote to <division>", which
          was true while the board was one division: the podium WAS the promotion set, one
          object stating one mechanic. The list is the cohort now, so these three are the
          week's best across every league and generally do NOT all promote. The promotion
          claim moved to the head, where the race is; the stage states what it actually is.
          ⚠ Copy is budgeted — see the note at the top of this component. */}
      <p className="pod-banner" data-testid="podium-promo">
        <span className="pod-banner-do">
          <span className="pod-banner-ico" aria-hidden>★</span>Top 3
        </span>
        <span className="pod-banner-to"> this week</span>
        <span className="pod-banner-sub">Every league</span>
      </p>
```

- [ ] **Step 3: Read promo state off the set**

```tsx
            data-promo={promoSet.has(e) || undefined}
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: ERRORS in `Leaderboard.tsx` — it still passes `promoteCount`/`promoteTo`. That is correct; Task 7 fixes it. Do not "fix" it here.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/Podium.tsx
git commit -m "feat(league): the podium is the cohort's top three"
```

---

### Task 7: Wire the screen and remove the orphans

**Files:**
- Modify: `frontend/src/aurora/screens/Leaderboard.tsx`
- Modify: `frontend/src/aurora/leaderboard/league.ts` (delete `promotionLineIndex`)
- Modify: `frontend/src/aurora/components/leaderboard/LeagueRow.tsx` (delete `PromotionZone`, `PromotionLine`)
- Modify: `frontend/src/aurora/leaderboard.css` (delete `.lg-zone`, `.lg-cut` and their descendants)
- Modify: `frontend/tests/league_logic.mjs` (delete the `promotionLineIndex` block)

- [ ] **Step 1: Derive the league race in `Leaderboard.tsx`**

Replace the `chase`, `splitPodium`, `lineAt` and `showCut` blocks (lines ~87-115) with:

```tsx
  /* THE RACE, DERIVED (2026-08-08). The list below is the whole cohort; promotion is still
     decided inside a division. `leagueRanks` recovers the viewer's division standing from the
     cohort-ranked list — sound because both use the same sort key, so filtering preserves
     order. Withheld entirely on a role-filtered view: that payload is a lens, not a race. */
  const leagueRank = useMemo(
    () => (role ? new Map<LeaderboardEntry, number>() : leagueRanks(entries, division)),
    [entries, division, role],
  );
  const myLeague = useMemo(
    () => entries.filter((e) => leagueRank.has(e))
                 .map((e) => ({ ...e, rank: leagueRank.get(e) as number })),
    [entries, leagueRank],
  );
  const chase = useMemo(
    () => computeChase(myLeague, promoteCount, division >= TOP_DIVISION),
    [myLeague, promoteCount, division],
  );
  /* Who is inside their OWN division's promotion zone. A set rather than an index range: your
     league's promoting members are scattered through a cohort list, so the filled gold region
     and the struck cut that used to end it cannot be drawn honestly and are gone. The per-row
     gold survives — LeagueRow already took `promo` as a boolean. */
  const promoSet = useMemo(() => {
    const s = new Set<LeaderboardEntry>();
    for (const [e, r] of leagueRank) if (r <= promoteCount) s.add(e);
    return s;
  }, [leagueRank, promoteCount]);
  /* The stage is the cohort's top three. Still withheld on a filtered view — those are the
     best three of a lens, and a 1-2-3 stage would misstate their real standing — and still
     refused when underfilled by splitPodium's own rule. */
  const { podium, rest } = useMemo(() => splitPodium(entries, role ? 0 : 3), [entries, role]);
  /* Null unless there is an honest standing to show: no filtered view, and no hidden viewer
     (who has no row anywhere, so `myLeague` cannot locate them). */
  const standing = useMemo(() => {
    const mine = myLeague.find((e) => e.is_you);
    if (!mine) return null;
    return { rank: mine.rank, pool: data?.pool_size ?? myLeague.length,
             name: data?.division_name ?? "Ember" };
  }, [myLeague, data?.pool_size, data?.division_name]);
```

Update the imports:

```tsx
import {
  computeChase, countdownLabel, msToWeekClose, splitPodium, leagueRanks,
  nextDivisionName, TOP_DIVISION,
} from "@/aurora/leaderboard/league";
import { LeagueRow } from "@/aurora/components/leaderboard/LeagueRow";
```

- [ ] **Step 2: Rewire the JSX**

`TierBand` gains `standing={standing}`.

`Podium` swaps its two props:

```tsx
        <Podium places={podium} promoSet={promoSet} clock={clock} onPeek={setPeek} youRef={setYouEl} />
```

The list loses the zone and the cut, and reads `promo` off the set:

```tsx
        <ol className="lg-list" data-testid="league-board">
          {rest.length > 0 ? (
            rest.map((e) => (
              <LeagueRow
                key={`${e.rank}-${e.name}`}
                e={e}
                promo={promoSet.has(e)}
                onPeek={setPeek}
                topXp={topXp}
                ref={e.is_you ? setYouEl : undefined}
              />
            ))
          ) : (
            <li className="lg-open" data-testid="lb-open-row">
              {podium.length > 0
                ? "That’s the whole cohort this week — the ladder fills in as more students join."
                : "No one’s on the board yet — earn Lumens to claim the first spot."}
            </li>
          )}
        </ol>
```

The `Fragment` import is now unused — drop it from the `react` import.

`YouBar` reads the set: `promo={promoSet.has(you)}`.

The auto-scroll skip loses `lineAt`:

```tsx
    if (promoSet.has(you)) return;   // already in your promotion zone: the top is your news
```

and its dependency array becomes `[you, promoSet, youOnStage]`.

The `IntersectionObserver` effect's dependency array drops nothing — keep `[rest.length, podium.length, role]`.

- [ ] **Step 3: Fix the two counts (spec §7)**

The "All" chip counts the cohort, not the division pool:

```tsx
                      aria-label={`All roles, ${entries.length} students`}
                      data-on={role === null} onClick={() => setRole(null)}>
                All<span className="lb-chip-n">{entries.length}</span>
```

And the 390px caption names what the list is. Note the `(data?.pool_size ?? 0) > 0` guard becomes `entries.length > 0` — `pool_size` is the division and no longer gates this strip:

```tsx
            {entries.length > 0 && (
              <span className="lb-count" data-testid="lb-pool">
                <span className="lb-count-sm">{entries.length} in the cohort</span>
                <span className="lb-count-lg">Ranked by Lumens earned this week</span>
              </span>
            )}
```

- [ ] **Step 4: Delete the orphans**

- `frontend/src/aurora/leaderboard/league.ts`: delete `promotionLineIndex` entirely (its only caller was the `lineAt` line just removed).
- `frontend/src/aurora/components/leaderboard/LeagueRow.tsx`: delete the `PromotionZone` and `PromotionLine` exports.
- `frontend/src/aurora/leaderboard.css`: delete the `.lg-zone`, `.lg-zone-ico`, `.lg-cut` and `.lg-sr` rules — but **first** `grep -rn "lg-sr" frontend/src` and keep it if anything else uses it.
- `frontend/tests/league_logic.mjs`: delete the `promotionLineIndex` assertions and drop it from the import list.

- [ ] **Step 5: Prove nothing still references them**

```bash
grep -rn "promotionLineIndex\|PromotionZone\|PromotionLine\|promotion-zone\|promotion-line\|lineAt\|showCut" frontend/src frontend/tests
```

Expected: no output. If `frontend/tests/league_assert.mjs` matches, it asserts on the deleted elements — read it and update those assertions to the new board before continuing.

- [ ] **Step 6: Typecheck, build, and run the pure tests**

```bash
cd frontend && npm run typecheck && node --experimental-strip-types tests/league_logic.mjs
```

Expected: typecheck clean, harness exits 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src frontend/tests/league_logic.mjs
git commit -m "feat(league): the board is the cohort, the race is your division"
```

---

### Task 8: Record the refined design lock

**Files:**
- Modify: `docs/design-locks.md`

- [ ] **Step 1: Append a refinement to the League lock**

Do NOT rewrite the lock. Add a dated refinement naming the criterion changed, matching the format of the existing "Criterion changed" entries in that file:

```markdown
- **Criterion changed (2026-08-08) — "the board is your division" → "the board is the cohort;
  the race is your division".** Reported as new students being missing from the leaderboard:
  they onboarded into Ember (migration 016's `DEFAULT 1`) while everyone else had been promoted
  to Volt, and the board only ever ranked the viewer's own division, so neither group could see
  the other. Nothing was broken — verified read-only against prod on 2026-08-07 — but "the
  cohort is invisible to itself" is not a board. Three lock statements follow:
  - the podium was the promotion set → it is the cohort's top three, and its banner says so
    ("Top 3 · this week · Every league") within the same 360px caption budget;
  - the promotion zone was a filled contiguous region ended by a struck cut → your league's
    promoting members are scattered through a cohort list, so it is a per-row gold state and
    `.lg-zone` / `.lg-cut` are deleted;
  - the lens strip's "N in your division" → "N in the cohort".
  Every row now carries a league chip in its own tier hue. The promotion race, the multipliers,
  `close_week` and the Monday ceremony are untouched — the change is to the VIEW.
  Unchanged: the STRUCK arcade material, the lip ladder, hue-is-identity, the >0.7 stage
  doctrine, and the ranks-visible budget (a cohort board only makes that easier to meet).
  Spec: `docs/superpowers/specs/2026-08-08-cohort-wide-league-board-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-locks.md
git commit -m "docs(design-locks): refine the League lock to a cohort board"
```

---

### Task 9: Gates, then ship

- [ ] **Step 1: Backend gates**

```bash
python -m pytest -q
```

Expected: all pass. `MOCK_MODE` engages automatically with no `GEMINI_API_KEY`.

- [ ] **Step 2: Frontend gates**

```bash
cd frontend && npm run typecheck && npm run build
```

⚠ In a fresh worktree `next build` through a `node_modules` junction needs `--webpack` (Turbopack rejects an out-of-root symlink) — see CLAUDE.md.

- [ ] **Step 3: The visual harness**

```bash
bash scripts/start-harness.sh all
```

⚠ A zero exit only means "nothing that ran failed" — COUNT the harnesses (23) in the output. A dead server never prints `FAIL:`. `league_assert` must still report ≥8 ranks visible.

- [ ] **Step 4: Behavioral verify on the running app**

Per `/ship-check`: log in as an account in division 2 and confirm the Ember students are on the board, each row carrying its league chip, with the head reading "#N of M in Volt". A green test suite is not a verified fix.

- [ ] **Step 5: Ship**

```bash
git fetch origin main
git rebase origin/main
```

If the rebase pulled anything in, RE-RUN steps 1-3. Then:

```bash
git fetch origin main && git push origin HEAD:main
```

- [ ] **Step 6: Clear the stale rank arrows**

⚠ **Required, and it is NOT optional** — see the spec. Stored `rank_prev` values are per-division and the live rank is now cohort-wide, so until this runs a student who did nothing can render as ▼5. Run in the Supabase SQL editor (never paste a file path — see `/db-migrate`):

```sql
UPDATE student_profiles SET rank_prev = NULL, rank_prev_day = NULL;
```

Every row then shows `arrowFor`'s "· New this week" glyph — already a distinct, honest state — until the next daily snapshot stamps cohort ranks.

- [ ] **Step 7: Confirm CI**

```bash
gh run list --branch main --limit 3
```

⚠ `cancelled` is not a pass.

---

## Self-Review

**Spec coverage:** §1 cohort list → Task 1. §2 league chip → Task 4. §3 race in the head → Tasks 3, 5, 7. §4 cohort podium → Task 6. §5 withheld zone/cut + orphan removal → Task 7. §6 unchanged surfaces → no task, asserted by Task 1's `pool_and_promote` test and the full suite in Task 9. §7 counts and captions → Task 7 Step 3. Movement arrows → Task 2 plus Task 9 Step 6. Design-lock criterion → Task 8. The `league.py` comment → Task 1 Step 4.

**Type consistency:** `leagueRanks(entries, division) → Map<T, number>` is defined in Task 3 and consumed in Task 7 with the same name and signature. `promoSet: Set<LeaderboardEntry>` is introduced in Task 6 and produced in Task 7. `standing: {rank, pool, name} | null` is declared in Task 5 and built in Task 7 with matching keys.

**Known follow-up, deliberately out of scope:** Home's rank strip (`tools/api/routers/home.py`) still ranks division-scoped, which is correct — it shows the race. It is left alone by design, and Task 1's change does not touch it.
