/* Pure unit test for the flashcards quit-forfeit guard. Run with Node's type
   stripping (forfeitGuard.ts is dependency-free, mirrors leaderboard_logic.mjs):
     node --experimental-strip-types frontend/tests/flashcards_forfeit_logic.mjs

   The guard owns one invariant: a round's −20 forfeit is charged AT MOST ONCE, and
   ONLY while a round is active. Every exit route (Switch deck, Quit, browser Back,
   ⌘K→away, refresh/close) funnels its decision through spend(). */
import assert from "node:assert";
import { createRoundForfeit } from "../src/aurora/lib/forfeitGuard.ts";

// 1) Nothing active yet ⇒ never charge (selection / intro / loading / results).
{
  const g = createRoundForfeit();
  assert.strictEqual(g.active, false);
  assert.strictEqual(g.spend(), false, "inactive round must not charge");
}

// 2) Active round ⇒ first spend charges, second does not (idempotent within a round).
{
  const g = createRoundForfeit();
  g.setActive(true);
  assert.strictEqual(g.active, true);
  assert.strictEqual(g.spend(), true, "first exit from an active round charges");
  assert.strictEqual(g.spend(), false, "a second exit in the same round must not double-charge");
}

// 3) Re-render safety: setActive(true) while ALREADY active must NOT re-arm — otherwise a
//    stray re-render after a charge would let a second exit charge again.
{
  const g = createRoundForfeit();
  g.setActive(true);
  assert.strictEqual(g.spend(), true);
  g.setActive(true); // still the same round (no false in between)
  assert.strictEqual(g.spend(), false, "staying active must not re-arm the charge");
}

// 4) A fresh round (inactive → active transition) re-arms: Switch deck / drill starts a new
//    forfeitable round.
{
  const g = createRoundForfeit();
  g.setActive(true);
  assert.strictEqual(g.spend(), true);   // round 1 charged
  g.setActive(false);                    // back to selection
  g.setActive(true);                     // round 2 begins
  assert.strictEqual(g.spend(), true, "a new round after re-arming charges again");
}

// 5) Leaving the round inactive (e.g. finished/completed) ⇒ later spend is inert.
{
  const g = createRoundForfeit();
  g.setActive(true);
  g.setActive(false);                    // finish() ⇒ round no longer active
  assert.strictEqual(g.active, false);
  assert.strictEqual(g.spend(), false, "no charge once the round is finished");
}

console.log("flashcards_forfeit_logic: all assertions passed");
