/* Pure unit test for the tier vocabulary + locked-case unlock hint.
   Run: node --experimental-strip-types frontend/tests/tiers_logic.mjs

   Stored keys (beginner/intermediate/advanced) map to the student-facing
   Foundational/Developing/Advanced names, and a LOCKED case must tell the student which
   tier to clear — account-wide, "in any topic" — because several advanced OT topic-sets
   (visual fields, corneal topography, anterior segment, PAM) have no Foundational case of
   their own, so the on-ramp is always in a different topic. */
import assert from "node:assert";
import { tierLabel, unlockHint } from "../src/aurora/lib/tiers.ts";

// Label mapping (key -> student-facing name).
assert.strictEqual(tierLabel("beginner"), "Foundational");
assert.strictEqual(tierLabel("intermediate"), "Developing");
assert.strictEqual(tierLabel("advanced"), "Advanced");
assert.strictEqual(tierLabel("ADVANCED"), "Advanced", "case-insensitive");
assert.strictEqual(tierLabel("expert"), "Expert", "unknown key title-cased, never blank");
assert.strictEqual(tierLabel(""), "");

// Unlock hint names the tier immediately below and stresses "any topic".
assert.strictEqual(unlockHint("intermediate"), "Clear 2 Foundational cases in any topic to unlock.");
assert.strictEqual(unlockHint("advanced"), "Clear 2 Developing cases in any topic to unlock.");

// Foundational and unknown tiers are never gated → no hint (card falls back to generic).
assert.strictEqual(unlockHint("beginner"), "");
assert.strictEqual(unlockHint("expert"), "");
assert.strictEqual(unlockHint(""), "");
assert.strictEqual(unlockHint(undefined), "");

console.log("tiers_logic: all assertions passed");
