/* Pure unit test for submitErrorMessage — what a student is told when a handover
   submission fails. Run: node --experimental-strip-types frontend/tests/station_submit_error_logic.mjs

   Branda (2026-08-03), on Submit handover: "'Could not evaluate. Please try again' is not
   pertaining to the handover content. Change clause to 'Network issue encountered. Pls
   submit again.'" One string covered every failure, and it named the wrong culprit: a
   student who had just spent fifteen minutes on a station read "could not evaluate" as a
   verdict on what they wrote. It is never that — the grader never saw it. */
import assert from "node:assert";
import { submitErrorMessage } from "../src/aurora/lib/submitError.ts";

// null = the request never reached the server at all.
const OFFLINE = submitErrorMessage(null);
const EXPIRED = submitErrorMessage(401);
const FLOOD = submitErrorMessage(429);
const SERVER = submitErrorMessage(500);
const all = { OFFLINE, EXPIRED, FLOOD, SERVER };

// The defect itself: one blanket string that blamed the evaluation.
for (const [name, msg] of Object.entries(all)) {
  assert.ok(!/could not evaluate/i.test(msg), `${name} still blames the evaluation: "${msg}"`);
  assert.ok(!/\b(your )?(handover|findings|answer|response)\b.*\b(unclear|invalid|incomplete|rejected)\b/i.test(msg),
    `${name} must never blame what the student wrote: "${msg}"`);
}

// Each failure names its own cause, so "what do I do now?" has an answer.
assert.match(OFFLINE, /network|connection|offline/i, "an unreachable server is a network issue");
assert.match(EXPIRED, /sign in|session/i, "an expired session must say so");
assert.match(FLOOD, /moment|wait|too (fast|quickly)/i, "a rate limit must ask them to wait");
assert.match(SERVER, /grader|server|our end/i, "a 5xx is ours, and must read as ours");

// Distinct causes, distinct messages — a blanket string is what we are removing.
assert.strictEqual(new Set(Object.values(all)).size, 4, "every failure class needs its own message");

// They just spent fifteen minutes in the station: every message must say the work survived
// and that submitting again is the move.
for (const [name, msg] of Object.entries(all)) {
  assert.match(msg, /submit again|try again|sign in again/i, `${name} must tell them what to do next`);
}
for (const name of ["OFFLINE", "FLOOD", "SERVER"]) {
  assert.match(all[name], /nothing (is|you).*lost|still here|not lost/i,
    `${name} must reassure that the handover survived: "${all[name]}"`);
}

// 403 is the same story as 401 from the student's seat; unknown codes fall back to "ours".
assert.strictEqual(submitErrorMessage(403), EXPIRED, "403 reads as an expired session too");
assert.strictEqual(submitErrorMessage(503), SERVER, "an unmapped 5xx uses the server message");
assert.strictEqual(submitErrorMessage(418), SERVER, "an unmapped code must not crash or blank");

console.log("station_submit_error_logic: all assertions passed");
