/* Pure-logic tests for the first-run tour model. No test runner / deps — plain Node asserts.
   Run: node frontend/tests/tour_engine_test.mjs
   (Node 24 runs the imported .ts via native type-stripping; on Node < 23.6 add
    --experimental-strip-types.) */
import assert from "node:assert/strict";
import { activeSteps, shouldStartTour, TOUR_STEPS, TOUR_KEY } from "../src/aurora/tour/tourSteps.ts";

let passed = 0;
const it = (name, fn) => { fn(); passed++; console.log("  ✓", name); };

// --- activeSteps(role) ---
it("students get every stop except admin, ending on the finale", () => {
  const ids = activeSteps("student").map((s) => s.id);
  assert.ok(!ids.includes("admin"), "no admin for students");
  assert.equal(ids[0], "welcome");
  assert.equal(ids.at(-1), "finish");
  assert.equal(ids.length, TOUR_STEPS.length - 1);
});
it("trainers and admins get the admin stop", () => {
  assert.ok(activeSteps("trainer").some((s) => s.id === "admin"));
  assert.ok(activeSteps("admin").some((s) => s.id === "admin"));
  assert.equal(activeSteps("trainer").length, TOUR_STEPS.length);
});
it("undefined role is treated as non-staff", () => {
  assert.ok(!activeSteps(undefined).some((s) => s.id === "admin"));
});
it("every step has a route and non-empty copy", () => {
  for (const s of TOUR_STEPS) {
    assert.ok(s.route.startsWith("/"), `${s.id} route`);
    assert.ok(s.title.length > 0 && s.body.length > 0, `${s.id} copy`);
  }
});

// --- shouldStartTour(...) — the show-once gate ---
// The tour is the first stop AFTER the password step, so it fires while the Eyecon is still
// uncustomized (customized === false is the per-account first-run signal) and BEFORE the
// daily check-in — which is why isCheckInDone is no longer part of the gate.
const base = { isAuthenticated: true, customized: false, seen: false, pathname: "/homepage" };
it("fires for a first-run student on the dashboard", () => assert.equal(shouldStartTour(base), true));
it("never re-fires once seen (show-once invariant)", () => assert.equal(shouldStartTour({ ...base, seen: true }), false));
it("waits while the avatar is still loading (customized undefined)", () => assert.equal(shouldStartTour({ ...base, customized: undefined }), false));
it("does not fire once the Eyecon is customized (onboarding already done)", () => assert.equal(shouldStartTour({ ...base, customized: true }), false));
it("does not replay for a returning student on a fresh device (seen false, customized true)", () => assert.equal(shouldStartTour({ ...base, customized: true, seen: false }), false));
it("does not fire off the dashboard hub", () => assert.equal(shouldStartTour({ ...base, pathname: "/chat" }), false));
it("does not fire when unauthenticated", () => assert.equal(shouldStartTour({ ...base, isAuthenticated: false }), false));

it("persistence key is the harness-seeded one", () => assert.equal(TOUR_KEY, "eyebot_tour_seen"));

console.log(`\n${passed} tour-engine checks passed.`);
