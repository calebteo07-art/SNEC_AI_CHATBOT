/* Pure unit test for stationMask — the progressive-reveal rule for the OSCE checklist.
   Run: node --experimental-strip-types frontend/tests/station_mask_logic.mjs

   Branda's feedback: a fully-visible checklist is a script students read off instead of
   recalling their own history-taking questions. Done steps stay readable (you must be able
   to review what you did), the CURRENT step is named (so nobody stalls), everything ahead
   is masked. Skipped steps are a distinct state — the gate moved past them, but the student
   said they could not complete them, so they must never read as done. */
import assert from "node:assert";
import { stepDisplay, maskFor, isRevealed, stepMark } from "../src/aurora/lib/stationMask.ts";

const S = (...xs) => new Set(xs);
const none = S();

// Done vs skipped — both past the gate, but they must never render alike.
assert.strictEqual(stepDisplay(1, S(1), none, 2), "done", "ticked + not skipped → done");
assert.strictEqual(stepDisplay(1, S(1), S(1), 2), "skipped", "ticked + skipped → skipped");

// The current step is named; everything else unticked is masked.
assert.strictEqual(stepDisplay(2, S(1), none, 2), "current", "gate step → current");
assert.strictEqual(stepDisplay(3, S(1), none, 2), "masked", "future step → masked");
assert.strictEqual(stepDisplay(9, S(1), none, 2), "masked", "far future → masked");

// All steps done (current === null) → nothing is left to mask.
assert.strictEqual(stepDisplay(3, S(1, 2, 3), none, null), "done", "all done, current null");
assert.strictEqual(stepDisplay(3, S(1, 2), none, null), "masked", "unticked with null gate stays masked");

// isRevealed is the one predicate the UI uses to decide whether to print action text.
assert.strictEqual(isRevealed("done"), true);
// A skipped step stays readable — the student has to be able to see what they gave up on.
assert.strictEqual(isRevealed("skipped"), true);
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

/* stepMark — the row's glyph + tone, owned here rather than inlined in the component so
   the "a step you couldn't finish reads as a failure, not a footnote" rule is testable
   without a browser (user-directed 2026-08-04). A skipped step used to render a small grey
   ✗ that scanned as decoration; it is now the same alarm the report uses. */
assert.deepStrictEqual(stepMark("done"), { glyph: "✓", tone: "done" });
assert.deepStrictEqual(stepMark("skipped"), { glyph: "!", tone: "miss" });
assert.strictEqual(stepMark("masked").tone, "locked");
assert.strictEqual(stepMark("current").glyph, "", "the gate step is marked by its ring, not a glyph");

// The alarm must not rest on colour alone — the glyph carries it for a mono print and for
// anyone who can't tell the red from the grey.
assert.notStrictEqual(stepMark("skipped").glyph, stepMark("done").glyph);
assert.notStrictEqual(stepMark("skipped").glyph, stepMark("masked").glyph);

console.log("station_mask_logic: all assertions passed");
