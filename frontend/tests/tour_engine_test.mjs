/* Pure-logic tests for the first-run tour model. No test runner / deps — plain Node asserts.
   Run: node frontend/tests/tour_engine_test.mjs
   (Node 24 runs the imported .ts via native type-stripping; on Node < 23.6 add
    --experimental-strip-types.) */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { activeSteps, shouldStartTour, TOUR_STEPS, TOUR_KEY } from "../src/aurora/tour/tourSteps.ts";
import { LUMEN_BADGES } from "../src/aurora/components/home/lumenBadges.ts";

let passed = 0;
const it = (name, fn) => { fn(); passed++; console.log("  ✓", name); };

/* Every .tsx the app actually renders, concatenated. Stylesheets are deliberately excluded:
   a class left behind in aurora.css after its component stopped emitting it is not an anchor,
   and reading CSS here would let exactly that drift pass. The tour's own directory is skipped
   so a selector can never satisfy itself. */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const RENDERED = (function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "tour") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(readFileSync(p, "utf8"));
  }
  return out;
})(SRC).join("\n");

/** The literal a component must contain for `sel` to resolve at runtime. */
function anchorToken(sel) {
  const testid = /^\[data-testid="([^"]+)"\]$/.exec(sel);
  if (testid) return `data-testid="${testid[1]}"`;
  const cls = /^\.([\w-]+)$/.exec(sel);
  if (cls) return cls[1];
  throw new Error(`unhandled selector form: ${sel} — teach anchorToken about it`);
}

/* Bounded by [^\w-] on both sides so a longer sibling cannot vouch for a missing anchor:
   `.aurora-composer` must not be satisfied by `aurora-composer-field`. */
const isRendered = (token) => new RegExp(`(^|[^\\w-])${token}([^\\w-]|$)`).test(RENDERED);

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
it("step ids are unique (the overlay keys its dots on them)", () => {
  const ids = TOUR_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

// --- Anchors must still be RENDERED somewhere (the staleness guard) ---
// The tour fails silently: a renamed or deleted anchor leaves the step showing a centred card
// with no spotlight, which reads as a broken step rather than an absent one (see the note on
// the admin step). Nothing else in the suite notices, so this is the check that does.
it("every anchor selector is still rendered by a live component", () => {
  for (const s of TOUR_STEPS) {
    for (const sel of [s.target, s.fallback]) {
      if (!sel) continue;
      assert.ok(isRendered(anchorToken(sel)), `${s.id}: nothing renders ${sel}`);
    }
  }
});

// --- The daily loop is introduced ---
// The home HUD (2026-08-06) put two CLAIMABLE controls on the dashboard. A readout a student
// misreads costs nothing; a button they never learn to press costs them the Lumens behind it,
// so both get a stop of their own.
it("both claimable HUD controls get a stop", () => {
  const byId = new Map(TOUR_STEPS.map((s) => [s.id, s]));
  for (const [id, target] of [["quests", '[data-testid="quest-board"]'],
                              ["chest", '[data-testid="chest-tile"]']]) {
    const s = byId.get(id);
    assert.ok(s, `${id} step is missing`);
    assert.equal(s.route, "/homepage", `${id} route`);
    assert.equal(s.target, target, `${id} anchor`);
  }
});
it("the badge count in the copy is the real one", () => {
  const badges = TOUR_STEPS.find((s) => s.id === "badges");
  assert.ok(badges, "badges step is missing");
  assert.match(badges.body, new RegExp(`\\b${LUMEN_BADGES.length}\\b`),
    `badges copy must state ${LUMEN_BADGES.length}`);
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
