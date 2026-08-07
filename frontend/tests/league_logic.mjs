/* Pure unit test for the weekly-league client math. league.ts is dependency-free so it runs
   under Node's type stripping (mirrors leaderboard_logic.mjs):
     node --experimental-strip-types frontend/tests/league_logic.mjs

   The three things worth testing here are the three that bit us in review:
     1. the SGT week close (the backend closes on Monday 00:00 UTC+8; a viewer-local
        countdown drifts by up to 15h and lies to half the cohort),
     2. where the cut falls — including the case the board actually ships (podiumCount 0,
        every rank in one list) and the old split it replaced,
     3. "no snapshot" vs "no change" — a new student must never be shown a fake zero.
*/
import assert from "node:assert";
import {
  msToWeekClose, countdownLabel, computeChase, arrowFor, promotionLineIndex, splitPodium,
  leagueRanks, nextDivisionName, nextRungPayoff, DIVISION_NAMES,
} from "../src/aurora/leaderboard/league.ts";

// ── the HOOK: what the next division pays, read off the server's own ladder ──
// A hard-coded copy of the economy drifts the first time it is retuned — silently, because
// a wrong multiplier still renders. These all read `multipliers` from the payload.
assert.deepStrictEqual(nextRungPayoff(2, [1, 1.1, 1.25, 1.5, 2]), { name: "Solar", mult: "×1.25" });
assert.deepStrictEqual(nextRungPayoff(1, [1, 1.1, 1.25, 1.5, 2]), { name: "Volt", mult: "×1.1" });
assert.deepStrictEqual(nextRungPayoff(3, [1, 1.1, 1.25, 1.5, 2]), { name: "Nova", mult: "×1.5" });
// Trailing zeros make a game number look like a currency: ×2, never ×2.00.
assert.deepStrictEqual(nextRungPayoff(4, [1, 1.1, 1.25, 1.5, 2]), { name: "Prism", mult: "×2" });
assert.strictEqual(nextRungPayoff(5, [1, 1.1, 1.25, 1.5, 2]), null);  // the summit pays into nothing
assert.strictEqual(nextRungPayoff(2, []), null);          // older server: no road, so no claim
assert.strictEqual(nextRungPayoff(2, [1, 1.1]), null);    // never read past the end of the ladder
// Bad data CLAMPS rather than throwing, and it clamps the same way nextDivisionName does —
// two helpers that answer "what is above me" must not disagree about a null column.
assert.deepStrictEqual(nextRungPayoff(null, [1, 1.1, 1.25, 1.5, 2]), { name: "Volt", mult: "×1.1" });
assert.deepStrictEqual(nextRungPayoff(0, [1, 1.1, 1.25, 1.5, 2]), { name: "Volt", mult: "×1.1" });
assert.strictEqual(nextRungPayoff(99, [1, 1.1, 1.25, 1.5, 2]), null);

// ── 0) divisions mirror tools/gamification/league.py ──
assert.deepStrictEqual([...DIVISION_NAMES], ["Ember", "Volt", "Solar", "Nova", "Prism"]);
assert.strictEqual(nextDivisionName(1), "Volt");
assert.strictEqual(nextDivisionName(4), "Prism");
assert.strictEqual(nextDivisionName(5), null);       // the summit promotes into nothing
// A null / bogus column clamps instead of throwing — the board must survive bad data.
assert.strictEqual(nextDivisionName(null), "Volt");
assert.strictEqual(nextDivisionName(0), "Volt");
assert.strictEqual(nextDivisionName(99), null);

// ── 1) the week close is Monday 00:00 SGT (= Sunday 16:00 UTC), never viewer-local ──
const H = 3600_000, D = 24 * H;
// Sat 2026-08-01 12:00 SGT === Sat 04:00 UTC. Close is Mon 00:00 SGT → 36h out.
assert.strictEqual(msToWeekClose(new Date("2026-08-01T04:00:00Z")), 36 * H);
// Sun 23:00 SGT === Sun 15:00 UTC → 1h out.
assert.strictEqual(msToWeekClose(new Date("2026-08-02T15:00:00Z")), 1 * H);
// Mon 00:30 SGT — the week just OPENED, so the next close is a full week minus 30 min.
assert.strictEqual(msToWeekClose(new Date("2026-08-02T16:30:00Z")), 7 * D - 30 * 60_000);
// Exactly on the boundary: Mon 00:00 SGT closes the NEXT Monday, never "0h left".
assert.strictEqual(msToWeekClose(new Date("2026-08-02T16:00:00Z")), 7 * D);
// A viewer in UTC-11 (the worst case) still gets the SGT answer: the instant is the input.
assert.strictEqual(msToWeekClose(new Date("2026-08-01T04:00:00Z")), 36 * H);

assert.strictEqual(countdownLabel(36 * H), "1d 12h");
assert.strictEqual(countdownLabel(7 * D), "7d 0h");
assert.strictEqual(countdownLabel(90 * 60_000), "1h 30m");
assert.strictEqual(countdownLabel(12 * 60_000), "12m");
assert.strictEqual(countdownLabel(0), "0m");
assert.strictEqual(countdownLabel(-5), "0m");   // never renders a negative

// ── 1b) the podium split ──
/* Restored 2026-08-04. The interesting cases are the two refusals, not the happy path:
   an underfilled stage, and the caller withholding the podium on a filtered view. */
const thirty = Array.from({ length: 30 }, (_, i) => i + 1);
{
  const { podium, rest } = splitPodium(thirty);
  assert.deepStrictEqual(podium, [1, 2, 3]);
  assert.strictEqual(rest.length, 27);
  assert.strictEqual(rest[0], 4);                       // the ladder resumes at rank 4
}
// Nothing is ever dropped or duplicated, whatever the split.
for (const places of [0, 1, 2, 3, 5, 40]) {
  const { podium, rest } = splitPodium(thirty, places);
  assert.deepStrictEqual([...podium, ...rest], thirty, `places=${places} lost or duplicated a rank`);
}
// An UNDERFILLED podium is no podium — a three-place stage holding two is a hole.
assert.deepStrictEqual(splitPodium([1, 2], 3), { podium: [], rest: [1, 2] });
assert.deepStrictEqual(splitPodium([1], 3), { podium: [], rest: [1] });
assert.deepStrictEqual(splitPodium([], 3), { podium: [], rest: [] });
// Exactly enough still stands: 3 of 3 is a full stage with an empty ladder under it.
assert.deepStrictEqual(splitPodium([1, 2, 3], 3), { podium: [1, 2, 3], rest: [] });
// places 0 is how the board withholds the podium on a role-filtered view, where the top
// three of a role are NOT ranks 1-2-3 of the division.
assert.deepStrictEqual(splitPodium(thirty, 0), { podium: [], rest: thirty });
assert.deepStrictEqual(splitPodium(thirty, -1), { podium: [], rest: thirty });
// It must not mutate its input — the board re-splits on every filter change.
const frozen = [1, 2, 3, 4];
splitPodium(frozen, 3);
assert.deepStrictEqual(frozen, [1, 2, 3, 4]);

// ── 1c) the league slice: the race, recovered from a cohort-ranked list ──
/* The board lists the WHOLE cohort (2026-08-08) but promotion is still decided inside a
   division, so the head has to recover the viewer's own race from a mixed list. This is a
   filter and a counter, never a re-sort: the cohort is ranked by the same (-xp, name) key
   the division ranking used, so the filtered order already IS the division order. */
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
  assert.strictEqual(ember.get(cohort[1]), 1);         // Nia: #2 overall, #1 in Ember
  assert.strictEqual(ember.get(cohort[2]), 2);         // Rae: #3 overall, #2 in Ember
  assert.strictEqual(ember.get(cohort[4]), 3);         // Wan: #5 overall, #3 in Ember
  assert.strictEqual(ember.get(cohort[0]), undefined); // Volt is not in this race
  assert.strictEqual(leagueRanks(cohort, 2).get(cohort[3]), 2);
  assert.strictEqual(leagueRanks(cohort, 5).size, 0);  // nobody at the summit yet
  // Keyed by the ENTRY OBJECT: two students can share a display name, and student_id is
  // deliberately stripped from the payload, so neither is available as a key.
  const twins = [
    { rank: 1, division: 1, xp: 90, name: "Sam Tan", is_you: false },
    { rank: 2, division: 1, xp: 80, name: "Sam Tan", is_you: true },
  ];
  const byName = leagueRanks(twins, 1);
  assert.strictEqual(byName.get(twins[0]), 1);
  assert.strictEqual(byName.get(twins[1]), 2);         // NOT collapsed onto one another
  // It must not mutate or reorder its input — the board re-derives on every read.
  assert.deepStrictEqual(cohort.map((e) => e.rank), [1, 2, 3, 4, 5]);

  /* The renumbered slice is what computeChase consumes, and its rank MUST be the league
     rank. Fed cohort ranks it would compare "#3" against a promote count of 3 and tell a
     student who leads their own division that they are outside the promotion zone. */
  const slice = cohort.filter((e) => ember.has(e)).map((e) => ({ ...e, rank: ember.get(e) }));
  assert.deepStrictEqual(slice.map((e) => e.rank), [1, 2, 3]);
  const chase = computeChase(slice, 1, false);
  assert.strictEqual(chase.kind, "promote");
  assert.strictEqual(chase.value, 46);                 // Rae (#2 in Ember, 474) chases 520
  // Proof the scale matters: the same viewer fed COHORT ranks is misread as promoting.
  assert.strictEqual(computeChase(cohort, 1, false).kind, "promote");
  assert.notStrictEqual(computeChase(cohort, 1, false).value, 46);
}

// ── 2) the promotion line ──
/* THE SHIPPING CASE (2026-08-04): the podium holds ranks 1-3, so the list is 27 rows and the
   cut falls after 4 of them — ranks 4-7, with 1-3 promoted on the stage above. Off by one
   here and the board promotes the wrong student, which is the most consequential pixel on
   the page. */
assert.strictEqual(promotionLineIndex(3, 27, 7), 4);
// …and the podium-less form the role-filtered view and small cohorts still use.
assert.strictEqual(promotionLineIndex(0, 30, 7), 7);
assert.strictEqual(promotionLineIndex(0, 8, 7), 7);   // exactly one row below the cut
assert.strictEqual(promotionLineIndex(0, 7, 7), null); // everyone visible promotes — don't draw
assert.strictEqual(promotionLineIndex(0, 30, 0), null);
// promote_count landing inside the podium → the line sits at the very top of the list.
assert.strictEqual(promotionLineIndex(3, 9, 3), 0);
assert.strictEqual(promotionLineIndex(3, 9, 1), 0);
// Prism (no promotion at the top division) → no line at all.
assert.strictEqual(promotionLineIndex(3, 27, 0), null);
// A line past the end of the rendered rows would imply everyone visible promotes — don't draw.
assert.strictEqual(promotionLineIndex(3, 2, 7), null);
assert.strictEqual(promotionLineIndex(3, 4, 7), null);  // exactly at the end: nothing below it
assert.strictEqual(promotionLineIndex(3, 5, 7), 4);     // one row below it — now it means something
assert.strictEqual(promotionLineIndex(3, 4, 8), null);

// ── 3) arrows: no snapshot is NOT no change ──
assert.strictEqual(arrowFor(null).dir, "none");
assert.strictEqual(arrowFor(undefined).dir, "none");
assert.strictEqual(arrowFor(null).glyph, "·");
assert.strictEqual(arrowFor(0).dir, "flat");
assert.strictEqual(arrowFor(0).glyph, "—");
assert.strictEqual(arrowFor(3).dir, "up");
assert.strictEqual(arrowFor(3).glyph, "▲3");
assert.strictEqual(arrowFor(-2).dir, "down");
assert.strictEqual(arrowFor(-2).glyph, "▼2");
assert.notStrictEqual(arrowFor(null).label, arrowFor(0).label);

// ── 4) the chase stat ──
// The viewer is located by `is_you` alone, so each case is a fixture with the flag moved.
const board = (youAt) => [
  { rank: 1, name: "A", xp: 12000 },
  { rank: 2, name: "B", xp: 9000 },
  { rank: 3, name: "C", xp: 7720 },
  { rank: 4, name: "D", xp: 7660 },
  { rank: 5, name: "E", xp: 5100 },
  { rank: 6, name: "F", xp: 4800 },
].map((e) => ({ ...e, is_you: e.rank === youAt }));

// Below the line (rank 5, top 4 promote) → the gap up to the LAST promotion slot (rank 4),
// not merely to the row above. That is the rank you actually have to reach.
const below = computeChase(board(5), 4, false);
assert.strictEqual(below.kind, "promote");
assert.strictEqual(below.value, 2560);           // D's 7660 − your 5100

// Above the line → the cushion over the student chasing you (spec §6.2).
const above = computeChase(board(4), 4, false);
assert.strictEqual(above.kind, "hold");
assert.strictEqual(above.value, 2560);           // your 7660 − E's 5100
assert.match(above.label, /#5/);

// Prism: there is nothing above the top division, so it never says "promotion zone".
const top = computeChase(board(5), 0, true);
assert.strictEqual(top.kind, "summit");
assert.strictEqual(top.value, 2560);             // D's 7660 − your 5100
assert.doesNotMatch(top.label, /promotion/i);
// Prism #1 has no one above → no number, just the hold.
assert.strictEqual(computeChase(board(1), 0, true).value, null);
assert.strictEqual(computeChase(board(1), 0, true).kind, "summit");

// Last place with no one below, but inside the promotion zone (tiny cohort).
const tiny = [{ rank: 1, name: "You", xp: 10, is_you: true }];
assert.strictEqual(computeChase(tiny, 1, false).kind, "hold");
assert.strictEqual(computeChase(tiny, 1, false).value, null);

// Hidden / filtered-out viewer → a neutral line, never a crash and never a fake number.
assert.strictEqual(computeChase(board(99), 4, false).kind, "idle");
assert.strictEqual(computeChase(board(99), 4, false).value, null);
assert.strictEqual(computeChase([], 0, false).kind, "idle");

// A viewer ranked exactly ON the line is safe, not chasing — rank 5 with the top 5 promoting.
const onLine = computeChase(board(5), 5, false);
assert.strictEqual(onLine.kind, "hold");
assert.strictEqual(onLine.value, 300);           // your 5100 − F's 4800
assert.match(onLine.label, /#6/);

console.log("PASS: league countdown + promotion line + arrows + chase");
