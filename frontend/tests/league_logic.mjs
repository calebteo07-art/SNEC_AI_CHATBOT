/* Pure unit test for the weekly-league client math. league.ts is dependency-free so it runs
   under Node's type stripping (mirrors leaderboard_logic.mjs):
     node --experimental-strip-types frontend/tests/league_logic.mjs

   The three things worth testing here are the three that bit us in review:
     1. the SGT week close (the backend closes on Monday 00:00 UTC+8; a viewer-local
        countdown drifts by up to 15h and lies to half the cohort),
     2. the promotion line landing INSIDE the podium (promote_count <= 3),
     3. "no snapshot" vs "no change" — a new student must never be shown a fake zero.
*/
import assert from "node:assert";
import {
  msToWeekClose, countdownLabel, computeChase, arrowFor, promotionLineIndex,
  nextDivisionName, DIVISION_NAMES, splitPodium,
} from "../src/aurora/leaderboard/league.ts";

// ── -1) the podium split (inherited from the retired tiers.ts) ──
// A cohort smaller than the podium must not throw — the Beam renders open slots instead.
assert.strictEqual(splitPodium([1, 2, 3, 4, 5]).podium.length, 3);
assert.strictEqual(splitPodium([1, 2, 3, 4, 5]).rest.length, 2);
assert.strictEqual(splitPodium([1]).podium.length, 1);
assert.strictEqual(splitPodium([1]).rest.length, 0);
assert.strictEqual(splitPodium([]).podium.length, 0);
assert.strictEqual(splitPodium([]).rest.length, 0);

// ── 0) divisions mirror tools/gamification/league.py ──
assert.deepStrictEqual([...DIVISION_NAMES], ["Bronze", "Silver", "Gold", "Platinum", "Diamond"]);
assert.strictEqual(nextDivisionName(1), "Silver");
assert.strictEqual(nextDivisionName(4), "Diamond");
assert.strictEqual(nextDivisionName(5), null);       // the summit promotes into nothing
// A null / bogus column clamps instead of throwing — the board must survive bad data.
assert.strictEqual(nextDivisionName(null), "Silver");
assert.strictEqual(nextDivisionName(0), "Silver");
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

// ── 2) the promotion line ──
// podium 3, rest 27, top 7 promote → the line sits after 4 ranked rows (ranks 4-7).
assert.strictEqual(promotionLineIndex(3, 27, 7), 4);
// promote_count landing inside the podium → the line sits at the very top of the list.
assert.strictEqual(promotionLineIndex(3, 9, 3), 0);
assert.strictEqual(promotionLineIndex(3, 9, 1), 0);
// Diamond (no promotion at the top division) → no line at all.
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

// Diamond: there is nothing above the top division, so it never says "promotion zone".
const top = computeChase(board(5), 0, true);
assert.strictEqual(top.kind, "summit");
assert.strictEqual(top.value, 2560);             // D's 7660 − your 5100
assert.doesNotMatch(top.label, /promotion/i);
// Diamond #1 has no one above → no number, just the hold.
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
