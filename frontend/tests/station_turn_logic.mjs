/* Pure unit test for stationTurn — which pane the student must act in right now.
   Run: node --experimental-strip-types frontend/tests/station_turn_logic.mjs

   Students couldn't tell where to act. This is the single source of truth for the
   spotlight, and it absorbs the `patientLocked` expression that used to live inline in
   CaseSession. CRITICAL: the badge names the CHANNEL, never the clinical content of the
   step — telling them "ask about pain" is exactly the spoon-feeding we removed. */
import assert from "node:assert";
import { stationTurn, canSkip } from "../src/aurora/lib/stationTurn.ts";

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

// ── canSkip — when a stuck student is offered the way out of the current step.
// Both panes get it: the action pane is where "I don't know how to do this" is MOST
// likely, and it used to be the one place with no escape at all.
assert.strictEqual(canSkip("patient", 2, false), false, "2 messages → still trying");
assert.strictEqual(canSkip("patient", 3, false), true, "3 messages, no tick → offer it");
// Opening a procedure and backing out of it costs more than typing a line, so the
// action pane offers the way out one attempt sooner.
assert.strictEqual(canSkip("eyebot", 1, false), false, "1 chip open → still trying");
assert.strictEqual(canSkip("eyebot", 2, false), true, "2 chip opens, no tick → offer it");

// Nothing to skip once the checklist is done or the station is graded.
assert.strictEqual(canSkip("handover", 9, false), false, "handover has no step to skip");
assert.strictEqual(canSkip(null, 9, false), false, "no turn → nothing to skip");
assert.strictEqual(canSkip("patient", 9, true), false, "graded → never");

console.log("station_turn_logic: all assertions passed");
