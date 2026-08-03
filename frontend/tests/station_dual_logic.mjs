/* Pure unit test for dualStep — the AND behind a checklist step that names TWO sources.
   Run: node --experimental-strip-types frontend/tests/station_dual_logic.mjs

   The reported bug: "Check that the patient is not allergic … by verifying with the
   patient's medical record/EMR and by asking the patient" is ONE critical step needing
   BOTH, but one click of the Check-allergy chip ticked it. So a dual step's two halves are
   tracked separately and the tick waits for both — in EITHER order, because the student may
   ask the patient before they think to open the chart. */
import assert from "node:assert";
import { admit, dualHalf, dualHint } from "../src/aurora/lib/dualStep.ts";

const S = (...xs) => new Set(xs);
const DUAL = S(6);           // step 6 is the allergy step
const NONE = S();

// ── admit: which candidate steps may tick right now, and which must wait.
// A normal step is unaffected — the whole point is that only dual steps are held back.
assert.deepStrictEqual(admit([3, 4], DUAL, NONE), { tick: [3, 4], hold: [] }, "normal steps tick");

// The examiner saw the patient asked, but the chart was never opened → hold it.
assert.deepStrictEqual(admit([6], DUAL, NONE), { tick: [], hold: [6] }, "asked only → hold");

// The chart half is done → the same candidate now ticks.
assert.deepStrictEqual(admit([6], DUAL, S(6)), { tick: [6], hold: [] }, "both halves → tick");

// Mixed batches keep their order and don't lose the normal steps to the held one.
assert.deepStrictEqual(admit([4, 6, 7], DUAL, NONE), { tick: [4, 7], hold: [6] }, "batch splits");

// Idempotent: re-admitting the same candidates gives the same answer (observe re-fires on
// every turn and would otherwise re-post or double-hold).
assert.deepStrictEqual(admit([6], DUAL, S(6)), admit([6], DUAL, S(6)), "stable");

// No dual steps at all (every other case in the app) → pure passthrough.
assert.deepStrictEqual(admit([1, 2], NONE, NONE), { tick: [1, 2], hold: [] }, "no dual → passthrough");
assert.deepStrictEqual(admit([], DUAL, S(6)), { tick: [], hold: [] }, "empty in, empty out");

// ── dualHalf: what the chip and the hint must say about a half-finished step.
// "record" — the chart is checked, the patient has not been asked. This is the state the
// student sees after clicking the chip, and the one that needs the hint (a critical step
// silently refusing to tick is what makes the station feel broken).
assert.strictEqual(dualHalf(6, DUAL, S(6), NONE, NONE), "record", "chart done → record");
// "asked" — the reverse order: they asked first, the chart is still unopened.
assert.strictEqual(dualHalf(6, DUAL, NONE, S(6), NONE), "asked", "patient asked → asked");
// Neither half, both halves, already ticked, or not a dual step → nothing to say.
assert.strictEqual(dualHalf(6, DUAL, NONE, NONE, NONE), "none", "untouched → none");
assert.strictEqual(dualHalf(6, DUAL, S(6), S(6), NONE), "none", "both halves → none");
assert.strictEqual(dualHalf(6, DUAL, S(6), NONE, S(6)), "none", "ticked → none");
assert.strictEqual(dualHalf(4, DUAL, S(4), NONE, NONE), "none", "not a dual step → none");

// ── dualHint: the one line that stops a half-done critical step reading as a broken app.
// It must name the OUTSTANDING half — telling a student who checked the chart to "check the
// chart" is what the old one-click behaviour already did to them.
assert.match(dualHint("record"), /ask/i, "chart done → tell them to ask the patient");
assert.ok(!/check the record|open the chart/i.test(dualHint("record")));
assert.match(dualHint("asked"), /record|chart|EMR/i, "asked → tell them to check the record");
assert.strictEqual(dualHint("none"), "", "nothing outstanding → no hint");

// The station's anti-spoiler rule (see station_turn_logic): mechanics copy may name the
// CHANNEL but never the clinical content or a step number.
for (const half of ["record", "asked"]) {
  assert.ok(!/\d/.test(dualHint(half)), `hint must not leak a step number: "${dualHint(half)}"`);
}
// Short enough to read at a glance — the help-density ceiling from 2026-07-29.
for (const half of ["record", "asked"]) {
  assert.ok(dualHint(half).length <= 110, `hint too long (${dualHint(half).length}): ${dualHint(half)}`);
}

console.log("station_dual_logic: all assertions passed");
