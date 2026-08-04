/* Pure unit test for apiErrorMessage — the ONE thing every student-facing API failure
   must say. Run: node --experimental-strip-types frontend/tests/api_error_logic.mjs

   Caleb (2026-08-04): "if got api error for all app features, tell student to reload
   page." Every feature had invented its own dead end — "Please try again", "check your
   connection", or (on Home and the League) nothing at all, because a failed read rendered
   as zeros. None of them told the student the one move that actually clears a stale
   session/cache. This module is the single source of that sentence; the harness pins it so
   a new surface can't quietly ship a message that leaves the student with nowhere to go. */
import assert from "node:assert";
import { RELOAD_INSTRUCTION, apiErrorMessage } from "../src/aurora/lib/apiError.ts";

// The instruction itself must name the act — "try again" alone is what we're replacing.
assert.match(RELOAD_INSTRUCTION, /reload/i, "the instruction must say reload");
assert.match(RELOAD_INSTRUCTION, /page/i, "reload WHAT — name the page");

const CAUSES = [
  "Could not load patients",
  "Couldn't light today's question.",
  "Couldn't load your Eyecon",
  "The League didn't load",
];

// Rule 1, the whole point: every message ends with the same instruction, verbatim.
for (const cause of CAUSES) {
  const msg = apiErrorMessage(cause);
  assert.ok(msg.endsWith(RELOAD_INSTRUCTION), `"${msg}" must end with the reload instruction`);
  assert.ok(msg.startsWith(cause.replace(/\.$/, "")), `"${msg}" must keep its own cause first`);
}

// Rule 2: a cause is a sentence. One full stop, never two.
assert.strictEqual(apiErrorMessage("Could not load patients"),
  `Could not load patients. ${RELOAD_INSTRUCTION}`, "an unpunctuated cause gets a full stop");
assert.strictEqual(apiErrorMessage("Could not load patients."),
  `Could not load patients. ${RELOAD_INSTRUCTION}`, "a punctuated cause is not double-stopped");
assert.ok(!/\.\s*\./.test(apiErrorMessage("Nothing loaded..")), "no doubled full stops");

// Rule 3: idempotent. Wrapping an already-wrapped message is what happens when a surface
// is migrated twice, and it must not stutter the instruction.
const once = apiErrorMessage("Could not load patients");
assert.strictEqual(apiErrorMessage(once), once, "re-wrapping must not duplicate the instruction");
assert.strictEqual(once.match(/Reload the page/gi)?.length, 1, "exactly one instruction");

// Rule 4: no cause is still a usable message — a surface that can't name what broke must
// not render a bare instruction with no subject, and must never render empty.
for (const empty of [undefined, null, "", "   "]) {
  const msg = apiErrorMessage(empty);
  assert.ok(msg.endsWith(RELOAD_INSTRUCTION), `${JSON.stringify(empty)} must still instruct`);
  assert.ok(msg.length > RELOAD_INSTRUCTION.length + 4, `${JSON.stringify(empty)} needs a subject too`);
}

// Rule 5: an API failure is OURS. It must never read as the student's mistake — the same
// rule the station's submit copy is held to (station_submit_error_logic.mjs).
for (const cause of [...CAUSES, ""]) {
  const msg = apiErrorMessage(cause);
  assert.ok(!/\byou (did|typed|entered|answered)\b/i.test(msg), `must not blame the student: "${msg}"`);
}

console.log("api_error_logic: all assertions passed");
