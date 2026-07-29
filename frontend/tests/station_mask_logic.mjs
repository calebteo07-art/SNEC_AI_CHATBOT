/* Pure unit test for stationMask — the progressive-reveal rule for the OSCE checklist.
   Run: node --experimental-strip-types frontend/tests/station_mask_logic.mjs

   Branda's feedback: a fully-visible checklist is a script students read off instead of
   recalling their own history-taking questions. Done steps stay readable (you must be able
   to review what you did), the CURRENT step is named (so nobody stalls), everything ahead
   is masked. Self-marked steps are a distinct state — they were never examiner-verified. */
import assert from "node:assert";
import { stepDisplay, maskFor, isRevealed } from "../src/aurora/lib/stationMask.ts";

const S = (...xs) => new Set(xs);
const none = S();

// Done vs self-marked — both ticked, but they must never render alike.
assert.strictEqual(stepDisplay(1, S(1), none, 2), "done", "ticked + not self → done");
assert.strictEqual(stepDisplay(1, S(1), S(1), 2), "self", "ticked + self-marked → self");

// The current step is named; everything else unticked is masked.
assert.strictEqual(stepDisplay(2, S(1), none, 2), "current", "gate step → current");
assert.strictEqual(stepDisplay(3, S(1), none, 2), "masked", "future step → masked");
assert.strictEqual(stepDisplay(9, S(1), none, 2), "masked", "far future → masked");

// All steps done (current === null) → nothing is left to mask.
assert.strictEqual(stepDisplay(3, S(1, 2, 3), none, null), "done", "all done, current null");
assert.strictEqual(stepDisplay(3, S(1, 2), none, null), "masked", "unticked with null gate stays masked");

// isRevealed is the one predicate the UI uses to decide whether to print action text.
assert.strictEqual(isRevealed("done"), true);
assert.strictEqual(isRevealed("self"), true);
assert.strictEqual(isRevealed("current"), true);
assert.strictEqual(isRevealed("masked"), false, "masked text must never be printed");

// The mask tracks the row's natural width without leaking length precisely enough to guess.
assert.match(maskFor("Identify patient — name + NRIC"), /^▨+$/, "mask is glyphs only");
assert.ok(maskFor("Short").length >= 6, "floor keeps short rows from collapsing");
assert.ok(maskFor("x".repeat(400)).length <= 22, "ceiling keeps long rows from wrapping");
assert.ok(
  maskFor("A much longer checklist action here").length > maskFor("Short").length,
  "longer actions get a longer mask so the list keeps its rhythm",
);

console.log("station_mask_logic: all assertions passed");
