/* Pure unit test for stationGate.observeCanTick — the /observe suppression gate.
   Run: node --experimental-strip-types frontend/tests/station_gate_logic.mjs

   The conversational examiner (/observe) can only tick NON-MANUAL steps, and the backend
   returns [] once none of those remain. So the frontend must stop firing /observe — a
   round-trip that, for intermediate/advanced cases, also costs an access-check DB read —
   once every observable step is already ticked (the tail of a consult). It must NOT
   suppress while any observable step is still open, nor before the station has loaded. */
import assert from "node:assert";
import { observeCanTick, performedOnly, skipOutcome } from "../src/aurora/lib/stationGate.ts";

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

// ── skipOutcome — the stuck-step escape valve must never silently do nothing.
// The valve fires /observe once with focus_step set ("look again, leniently, at THIS
// step") and skips only if that still finds nothing. It used to return early on ANY
// non-empty reply — but `advance` ticks only an in-order run STARTING AT THE GATE, so a
// reply of [6,7] while the gate sits at 5 ticked nothing AND skipped nothing. The student
// pressed "unable to complete this checklist item", watched nothing happen, and the gate
// froze with every later step and manual chip locked behind it. Their only exit was
// submitting an incomplete handover and forfeiting the remaining marks.
//
// Not a rare shape: out-of-order examiner credits are never persisted (already_ticked
// carries only the ticked set), so those same numbers come back on every pass. And when
// the gate step is a MANUAL procedure — the exact case the button exists for — it is in
// the request's exclude_steps, so the backend structurally cannot return it.
{
  // The focus step came back → credit it, do not skip. The student really did do it.
  const found = skipOutcome(5, [5]);
  assert.deepStrictEqual(found.credit, [5]);
  assert.strictEqual(found.skip, false, "a step the examiner found must not be skipped");

  // THE BUG: only unrelated, far-ahead steps came back.
  const other = skipOutcome(5, [6, 7]);
  assert.deepStrictEqual(other.credit, [6, 7], "incidental hits are still credited");
  assert.strictEqual(other.skip, true, "the focus step was NOT found → the valve must skip");

  // Nothing came back at all (the manual-step case: the backend cannot return it).
  assert.strictEqual(skipOutcome(5, []).skip, true);
  assert.strictEqual(skipOutcome(5, undefined).skip, true, "a failed request must still skip");

  // Focus among several → credit all, skip nothing.
  const mixed = skipOutcome(5, [5, 6]);
  assert.deepStrictEqual(mixed.credit, [5, 6]);
  assert.strictEqual(mixed.skip, false);

  // The valve must never fail closed: every shape yields a decision, never a hang.
  for (const sat of [undefined, [], [1], [5], [99, 100]]) {
    const out = skipOutcome(5, sat);
    assert.ok(Array.isArray(out.credit) && typeof out.skip === "boolean");
  }
}

console.log("station_gate_logic: all assertions passed");
