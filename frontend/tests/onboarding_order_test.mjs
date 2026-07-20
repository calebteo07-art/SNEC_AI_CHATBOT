/* Pure-logic tests for the first-login order. No test runner / deps — plain Node asserts.
   Run: node --experimental-strip-types frontend/tests/onboarding_order_test.mjs
   (Node 24 runs the imported .ts via native type-stripping.) */
import assert from "node:assert/strict";
import { onboardingStage, resolveCustomized, wantsAlwaysStudio } from "../src/screens/onboarding.ts";

let passed = 0;
const it = (name, fn) => { fn(); passed++; console.log("  ✓", name); };

/* A brand-new student the instant they authenticate: temp password, no Eyecon, no tour,
   no check-in. */
const fresh = { mustChangePassword: true, customized: false, tourSeen: false, isCheckInDone: false };
/* A student who finished onboarding, back the next morning. */
const returning = { mustChangePassword: false, customized: true, tourSeen: true, isCheckInDone: false };

// --- the happy path, in order ---
it("1. a brand-new student is asked for a password first", () =>
  assert.equal(onboardingStage(fresh), "password"));
it("2. then the tour", () =>
  assert.equal(onboardingStage({ ...fresh, mustChangePassword: false }), "tour"));
it("3. then the Eyecon Studio", () =>
  assert.equal(onboardingStage({ ...fresh, mustChangePassword: false, tourSeen: true }), "studio"));
it("4. then the check-in", () =>
  assert.equal(onboardingStage({ ...fresh, mustChangePassword: false, tourSeen: true, customized: true }), "checkin"));
it("5. then the app", () =>
  assert.equal(onboardingStage({ mustChangePassword: false, customized: true, tourSeen: true, isCheckInDone: true }), "app"));

// --- password outranks everything ---
it("password outranks the Studio", () =>
  assert.equal(onboardingStage({ ...fresh, tourSeen: true }), "password"));
it("password outranks a returning student's check-in", () =>
  assert.equal(onboardingStage({ ...returning, mustChangePassword: true }), "password"));
it("password outranks a still-loading avatar", () =>
  assert.equal(onboardingStage({ ...fresh, customized: undefined }), "password"));

// --- the returning student is untouched by the first-run rungs ---
it("a returning student goes straight to the check-in", () =>
  assert.equal(onboardingStage(returning), "checkin"));
it("a returning student who checked in today reaches the app", () =>
  assert.equal(onboardingStage({ ...returning, isCheckInDone: true }), "app"));
it("a returning student on a NEW device does not replay the tour", () =>
  // empty localStorage ⇒ tourSeen false, but customized===true ⇒ not first-run.
  assert.equal(onboardingStage({ ...returning, tourSeen: false, isCheckInDone: true }), "app"));

// --- loading: never guess "returning" while server truth is in flight ---
it("waits while the avatar is still loading", () =>
  assert.equal(onboardingStage({ mustChangePassword: false, customized: undefined, tourSeen: false, isCheckInDone: false }), "loading"));
it("waits even when a stale device flag says the tour was seen", () =>
  // The hole a tourSeen shortcut would open: a first-run student reloading between
  // tour-finish and Studio-save must NOT be sent to the check-in ahead of the Studio.
  assert.equal(onboardingStage({ mustChangePassword: false, customized: undefined, tourSeen: true, isCheckInDone: false }), "loading"));

// --- reload mid-onboarding resumes at the right rung ---
it("a reload after the tour resumes at the Studio, not the check-in", () =>
  assert.equal(onboardingStage({ mustChangePassword: false, customized: false, tourSeen: true, isCheckInDone: false }), "studio"));
it("a reload mid-tour resumes at the tour", () =>
  assert.equal(onboardingStage({ mustChangePassword: false, customized: false, tourSeen: false, isCheckInDone: false }), "tour"));
it("a first-run student who somehow checked in still owes the tour", () =>
  // isCheckInDone is device-local: another account on this device may have checked in
  // today. It must never let a new student skip the tour or the Studio.
  assert.equal(onboardingStage({ mustChangePassword: false, customized: false, tourSeen: false, isCheckInDone: true }), "tour"));

// --- resolveCustomized(...) — query state ⇒ the first-run signal ---
it("in flight ⇒ undefined, so the ladder waits", () =>
  assert.equal(resolveCustomized(true, undefined), undefined));
it("settled false ⇒ first-run", () =>
  assert.equal(resolveCustomized(false, false), false));
it("settled true ⇒ returning", () =>
  assert.equal(resolveCustomized(false, true), true));
it("settled but the field is MISSING ⇒ fails open to returning, never a forever-spinner", () =>
  // A /api/avatar that answers without `customized` (or a failed fetch: settled, no data)
  // reads exactly like a pending query. Blocking on it strands every student on a spinner.
  assert.equal(resolveCustomized(false, undefined), true));
it("a missing field cannot strand the student at the loading stage", () =>
  assert.equal(
    onboardingStage({ mustChangePassword: false, customized: resolveCustomized(false, undefined), tourSeen: true, isCheckInDone: true }),
    "app",
  ));

// --- wantsAlwaysStudio(flag): the dev "always re-show welcome Studio" override is STRICTLY
//     opt-in. Regression: it used to auto-enable outside production (NODE_ENV !== "production"),
//     re-forcing the welcome Studio on every reload in `next dev`. ---
it("dev-always Studio is OFF by default (flag absent) — the reported re-show bug", () => {
  assert.equal(wantsAlwaysStudio(null), false);
  assert.equal(wantsAlwaysStudio(undefined), false);
});
it("dev-always Studio turns on only for the explicit \"1\" opt-in", () =>
  assert.equal(wantsAlwaysStudio("1"), true));
it("dev-always Studio stays off for \"0\" or anything else", () => {
  assert.equal(wantsAlwaysStudio("0"), false);
  assert.equal(wantsAlwaysStudio("true"), false);
});

console.log(`\n${passed} onboarding-order checks passed.`);
