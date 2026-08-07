/* Behavioral assert for the first-run grand tour (the ACTIVE path; aurora_assert already
   proves it stays dormant when eyebot_tour_seen is seeded). Mirrors the aurora harness mock
   setup but (a) does NOT seed eyebot_tour_seen and (b) mocks /api/avatar as UNCUSTOMIZED.
   The tour is stop 2 of 4 (password → tour → Studio → check-in), so it must fire for a
   student who has neither built an Eyecon nor checked in. Drives the whole cross-route
   walkthrough, then verifies the hand-off to the Studio and show-once persistence.
   Run against a warm standalone server: node frontend/tests/tour_assert.mjs http://127.0.0.1:3000 */
import { chromium } from "playwright";
import { activeSteps } from "../src/aurora/tour/tourSteps.ts";
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const b = await chromium.launch();

const studentUser = {
  full_name: "Test Student", email: "student@snec.com.sg", student_id: "S001",
  role: "student", student_role: "OA", must_change: false,
};
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_rail_pinned", "1");
  // NB: no eyebot_checkin_date — the tour now PRECEDES the check-in, so it must fire for a
  // student who hasn't checked in. And a fresh context has no eyebot_tour_seen, so the first
  // load is genuinely first-run; we deliberately do NOT clear it here, which would also wipe
  // the value the app persists on finish and break the show-once reload check below.
}, studentUser);
await ctx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
const JSON_OK = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
await ctx.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
await ctx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(studentUser)));
// UNCUSTOMIZED avatar → server truth, and the per-account first-run signal that fires the
// tour. The Eyecon narrator falls back to the default look — exactly what a new student sees
// before they reach the Studio.
await ctx.route("**/api/avatar", (r) => r.fulfill(JSON_OK({ config: {}, axes: {}, customized: false })));
await ctx.route("**/api/progress", (r) => r.fulfill(JSON_OK({
  xp: 1240, level: 7, streak: 4, daily_goal: 100, xp_today: 60,
  streak_detail: { current: 4, best: 9, tier: "First Light", next_tier: "Clear View", to_next: 1, done_today: false, week: [], month: [] },
})));
await ctx.route("**/api/cases", (r) => r.fulfill(JSON_OK({ cases: [
  { case_id: "C001", title: "Red eye", difficulty: "beginner", topic: "Glaucoma", estimated_minutes: 10,
    patient: { name: "Mdm Tan", age: 64, presenting_complaint: "Pain" } },
] })));

let failed = false;
const check = (cond, msg) => { if (cond) console.log("PASS:", msg); else { console.error("FAIL:", msg); failed = true; } };

const page = await ctx.newPage();
const tour = page.locator('[data-testid="tour"]');
const stepAttr = () => tour.getAttribute("data-step");

await page.goto(base + "/homepage", { waitUntil: "domcontentloaded" });

// 1) It fires on the first dashboard landing, on the welcome step, with the Eyecon narrator.
await tour.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
check(await tour.count() === 1, "tour overlay fires on the first /dashboard landing");
check(await stepAttr() === "welcome", "starts on the welcome step");
check(await page.locator(".tour-head .eyecon-wrap").count() === 1, "Eyecon narrator avatar renders in the card");
check(((await page.locator(".tour-title").first().textContent()) ?? "").includes("Welcome"), "welcome copy is shown");
check((await page.locator('[data-testid="tour-next"]').textContent()) === "Next →", "advance CTA reads 'Next →' (not the finale label)");

// 2) Walk the whole student walkthrough (no admin stop for a student).
// The order, the routes and the anchors all come from the tour model itself. This used to be
// a hard-coded list of ids, which is a second copy of the truth and drifts the moment a stop
// is added — a new step was simply never walked, and the harness stayed green saying so.
const walk = activeSteps("student");
check(walk.length > 6 && walk[0].id === "welcome" && walk.at(-1).id === "finish",
  "the student walk is a whole tour (welcome … finish)");
for (let i = 1; i < walk.length; i++) {
  const step = walk[i];
  // The provider pushes only when the route actually changes — same condition, same source.
  const navigates = step.route !== walk[i - 1].route;
  await page.locator('[data-testid="tour-next"]').click();
  // For cross-route steps, wait for the client navigation to settle before asserting the URL
  // (data-step flips synchronously with setIndex while router.push resolves asynchronously).
  if (navigates) {
    await page.waitForURL((u) => new URL(u).pathname === step.route, { timeout: 20000 }).catch(() => {});
  }
  await page.waitForFunction(
    (s) => document.querySelector('[data-testid="tour"]')?.getAttribute("data-step") === s,
    step.id, { timeout: 20000 },
  ).catch(() => {});
  check(await stepAttr() === step.id, `advances to the "${step.id}" step`);
  if (navigates) {
    check(new URL(page.url()).pathname === step.route, `navigated to ${step.route} for the "${step.id}" step`);
  }
  // THE ANCHOR RESOLVED. A step whose target never matches degrades to a centred card with
  // no spotlight — it still advances, still reads as a step, and every id/route check above
  // still passes. So the spotlight is the only thing that proves the selector is real in the
  // running app, which is exactly what goes stale when a component is renamed.
  if (step.target) {
    await page.locator(".tour-spot").waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    check(await page.locator(".tour-spot").count() === 1,
      `spotlights a real anchor for the "${step.id}" step (${step.target})`);
  }
}

// 3) Finale label + end + persistence + hand-off to the next stage.
check((await page.locator('[data-testid="tour-next"]').textContent()) === "Let's go!", "finale CTA reads \"Let's go!\"");
await page.locator('[data-testid="tour-next"]').click();
await tour.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
check(await tour.count() === 0, "tour ends after the finale");
check(await page.evaluate(() => localStorage.getItem("eyebot_tour_seen")) === "true", "eyebot_tour_seen persisted true on finish");
// The tour is stop 2 of 4: ending it must hand the student straight to the welcome Studio.
await page.waitForURL((u) => new URL(u).pathname === "/studio", { timeout: 20000 }).catch(() => {});
check(new URL(page.url()).pathname === "/studio", "finishing the tour hands off to the welcome Studio");

// 4) Show-once AND resume-at-the-right-rung: a reload must not replay the tour, and must
//    resume at the Studio — NOT the check-in. This is the hole the "loading" stage closes.
await page.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check(await tour.count() === 0, "tour does NOT reappear after completion (show-once invariant)");
check(new URL(page.url()).pathname === "/studio", "a reload after the tour resumes at the Studio, not the check-in");

// 5) Interrupted first run: the tour marks itself seen the moment it STARTS, so a reload BEFORE
//    finishing it must not replay it — the student is handed straight on to the Studio (its next
//    onboarding rung). Regression: it used to persist "seen" only on finish, so any interruption
//    (F5 mid-tour, a closed tab) restarted the whole walk on every subsequent load.
const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx2.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_rail_pinned", "1");
}, studentUser);
await ctx2.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
await ctx2.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
await ctx2.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(studentUser)));
await ctx2.route("**/api/avatar", (r) => r.fulfill(JSON_OK({ config: {}, axes: {}, customized: false })));
await ctx2.route("**/api/progress", (r) => r.fulfill(JSON_OK({
  xp: 1240, level: 7, streak: 4, daily_goal: 100, xp_today: 60,
  streak_detail: { current: 4, best: 9, tier: "First Light", next_tier: "Clear View", to_next: 1, done_today: false, week: [], month: [] },
})));

const page2 = await ctx2.newPage();
const tour2 = page2.locator('[data-testid="tour"]');
await page2.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
await tour2.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
check(await tour2.count() === 1, "interrupt case: tour fires on the first landing");
check(await page2.evaluate(() => localStorage.getItem("eyebot_tour_seen")) === "true",
  "eyebot_tour_seen persisted true as soon as the tour STARTS (not only on finish)");
// Reload WITHOUT ever finishing the tour.
await page2.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
await page2.waitForTimeout(2500);
check(await tour2.count() === 0, "tour does NOT replay after an interrupted (unfinished) first run");
await page2.waitForURL((u) => new URL(u).pathname === "/studio", { timeout: 20000 }).catch(() => {});
check(new URL(page2.url()).pathname === "/studio", "an interrupted tour hands the student on to the Studio");

await b.close();
if (failed) { console.error("\nTOUR ASSERT: FAILURES ABOVE"); process.exit(1); }
console.log("\nTOUR ASSERT: all checks passed.");
