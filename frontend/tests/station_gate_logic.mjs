/* Pure unit test for stationGate.observeCanTick — the /observe suppression gate.
   Run: node --experimental-strip-types frontend/tests/station_gate_logic.mjs

   The conversational examiner (/observe) can only tick NON-MANUAL steps, and the backend
   returns [] once none of those remain. So the frontend must stop firing /observe — a
   round-trip that, for intermediate/advanced cases, also costs an access-check DB read —
   once every observable step is already ticked (the tail of a consult). It must NOT
   suppress while any observable step is still open, nor before the station has loaded. */
import assert from "node:assert";
import { observeCanTick, performedOnly } from "../src/aurora/lib/stationGate.ts";

const S = (...xs) => new Set(xs);

// Some observable step still open → fire the examiner.
assert.strictEqual(observeCanTick([1, 2, 3], S(1)), true, "open steps → run");
assert.strictEqual(observeCanTick([1, 2, 3], S()), true, "none ticked → run");
assert.strictEqual(observeCanTick([1, 2, 3], S(1, 2)), true, "one still open → run");

// Every observable step ticked → skip (nothing left for the examiner to detect).
assert.strictEqual(observeCanTick([1, 2, 3], S(1, 2, 3)), false, "all observable ticked → skip");
assert.strictEqual(observeCanTick([2, 5], S(2, 5, 9)), false, "extra (manual) ticks don't matter → skip");

// Unknown / not-yet-loaded (empty observable list) → never suppress; the backend still
// no-ops correctly, and this preserves today's behaviour for all-manual stations.
assert.strictEqual(observeCanTick([], S()), true, "empty observable → don't suppress");
assert.strictEqual(observeCanTick([], S(1, 2)), true, "empty observable, some ticked → don't suppress");

// ── performedOnly — a skipped step advances the gate but was NEVER done.
// `ticked` means "the gate moved past this", which is not the same as "the student did
// this". The grade, the debrief and the saved record all take the second meaning, so the
// skipped steps come back out here. Getting this wrong hands out credit for giving up.
assert.deepStrictEqual(performedOnly(S(1, 2, 3), S(2)), [1, 3], "skipped step is not performed");
assert.deepStrictEqual(performedOnly(S(1, 2, 3), S()), [1, 2, 3], "nothing skipped → all performed");
assert.deepStrictEqual(performedOnly(S(1, 2), S(1, 2)), [], "everything skipped → nothing performed");
assert.deepStrictEqual(performedOnly(S(), S(1)), [], "skip of an unticked step is harmless");
// Ordered output — the payload must not reshuffle between submits of the same station.
assert.deepStrictEqual(performedOnly(S(3, 1, 2), S()), [1, 2, 3], "output is in step order");

console.log("station_gate_logic: all assertions passed");
