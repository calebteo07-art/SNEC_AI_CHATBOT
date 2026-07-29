/* Pure unit test for stationTurn — which pane the student must act in right now.
   Run: node --experimental-strip-types frontend/tests/station_turn_logic.mjs

   Students couldn't tell where to act. This is the single source of truth for the
   spotlight, and it absorbs the `patientLocked` expression that used to live inline in
   CaseSession. CRITICAL: the badge names the CHANNEL, never the clinical content of the
   step — telling them "ask about pain" is exactly the spoon-feeding we removed. */
import assert from "node:assert";
import { stationTurn } from "../src/aurora/lib/stationTurn.ts";

const S = (...xs) => new Set(xs);
const loaded = { loaded: true, hasResult: false, hasEyebot: true };

// A verbal gate step → the patient pane.
assert.strictEqual(stationTurn(1, S(3, 4), loaded).turn, "patient", "verbal step → patient");
// A manual gate step → the action pane.
assert.strictEqual(stationTurn(3, S(3, 4), loaded).turn, "eyebot", "manual step → eyebot");
// Every step done → the handover is the only thing left.
assert.strictEqual(stationTurn(null, S(3, 4), loaded).turn, "handover", "no gate → handover");

// A conversation-only case has no action pane, so a turn can never point at one.
const noEyebot = { loaded: true, hasResult: false, hasEyebot: false };
assert.strictEqual(stationTurn(3, S(3), noEyebot).turn, "patient", "no eyebot pane → never eyebot");

// Not loaded / already graded → no spotlight at all (nothing to do, or nothing left to do).
assert.strictEqual(stationTurn(1, S(), { ...loaded, loaded: false }).turn, null, "unloaded → null");
assert.strictEqual(stationTurn(1, S(), { ...loaded, hasResult: true }).turn, null, "graded → null");

// Badges name the channel and nothing else.
assert.match(stationTurn(1, S(3), loaded).badge, /talk to the patient/i);
assert.match(stationTurn(3, S(3), loaded).badge, /EyeBot/);
assert.match(stationTurn(null, S(3), loaded).badge, /handover/i);
assert.strictEqual(stationTurn(1, S(), { ...loaded, loaded: false }).badge, "", "no turn → no badge");

// The anti-spoiler guarantee, asserted rather than trusted: no badge may carry step text.
for (const gate of [1, 3, null]) {
  const { badge } = stationTurn(gate, S(3, 4), loaded);
  assert.ok(!/\d/.test(badge), `badge must not leak a step number: "${badge}"`);
}

console.log("station_turn_logic: all assertions passed");
