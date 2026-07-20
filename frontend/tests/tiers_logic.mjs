/* Pure unit test for the tier vocabulary (tierLabel).
   Run: node --experimental-strip-types frontend/tests/tiers_logic.mjs

   Stored keys (beginner/intermediate/advanced) map to the student-facing
   Foundational/Developing/Advanced names. The locked-case unlock note is now computed on
   the backend (per-topic gate, tools/cases/tier_gate.py) and delivered as
   CaseInfo.unlock_hint, so its logic is covered by tests/cases/test_tier_gate.py and
   test_case_access.py — not here. */
import assert from "node:assert";
import { tierLabel } from "../src/aurora/lib/tiers.ts";

// Label mapping (key -> student-facing name).
assert.strictEqual(tierLabel("beginner"), "Foundational");
assert.strictEqual(tierLabel("intermediate"), "Developing");
assert.strictEqual(tierLabel("advanced"), "Advanced");
assert.strictEqual(tierLabel("ADVANCED"), "Advanced", "case-insensitive");
assert.strictEqual(tierLabel("expert"), "Expert", "unknown key title-cased, never blank");
assert.strictEqual(tierLabel(""), "");

console.log("tiers_logic: all assertions passed");
