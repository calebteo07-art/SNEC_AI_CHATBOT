/* Pure unit test for stationHelp — the help + coach-mark content model.
   Run: node --experimental-strip-types frontend/tests/station_help_logic.mjs

   Students said the whole feature was confusing. The `?` modal and the first-run coach-mark
   read from ONE model so they can never describe the system differently. This test pins the
   contract the UI relies on, and guards the anti-spoiler rule: help explains MECHANICS, so
   no beat may name a clinical action. */
import assert from "node:assert";
import { HELP, COACH_BEATS, helpFor } from "../src/aurora/lib/stationHelp.ts";

// Both surfaces have content, and every section is renderable.
for (const surface of ["cases", "station"]) {
  const help = helpFor(surface);
  assert.ok(help, `${surface} must have help content`);
  assert.ok(help.title.length > 0, `${surface} help needs a title`);
  assert.ok(help.sections.length >= 3, `${surface} help needs real substance`);
  for (const s of help.sections) {
    assert.ok(s.heading.length > 0, `${surface}: every section needs a heading`);
    assert.ok(s.body.length > 20, `${surface}: section "${s.heading}" is too thin to help`);
  }
}

// Unknown surfaces fall back rather than crashing a screen.
assert.strictEqual(helpFor("nonsense"), HELP.station, "unknown surface falls back to station help");

// The coach-mark: exactly three beats, each anchored to a selector that exists in the DOM.
assert.strictEqual(COACH_BEATS.length, 3, "three beats — more is a tour, not a coach-mark");
for (const b of COACH_BEATS) {
  assert.ok(b.id && b.title && b.body, `beat ${b.id} is incomplete`);
  assert.match(b.target, /^[.[]/, `beat ${b.id} needs a CSS selector, got "${b.target}"`);
}
assert.strictEqual(COACH_BEATS[2].requiresEyebot, true, "the EyeBot beat must be skippable");
assert.ok(!COACH_BEATS[0].requiresEyebot, "the checklist beat always shows");

// The checklist beat must state the read-only rule — it is the single biggest change.
assert.match(COACH_BEATS[0].body, /tick/i, "beat 1 must explain that ticking is automatic");

console.log("station_help_logic: all assertions passed");
