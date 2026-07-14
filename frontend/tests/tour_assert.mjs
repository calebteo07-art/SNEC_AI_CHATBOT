/* Behavioral assert for the first-run grand tour (the ACTIVE path; aurora_assert already
   proves it stays dormant when eyebot_tour_seen is seeded). Mirrors the aurora harness mock
   setup but (a) does NOT seed eyebot_tour_seen and (b) mocks /api/avatar as customized, so all
   three onboarding gates are clear and the tour fires on the first /dashboard landing. Drives
   the whole cross-route walkthrough, then verifies show-once persistence.
   Run against a warm standalone server: node frontend/tests/tour_assert.mjs http://127.0.0.1:3000 */
import { chromium } from "playwright";
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
  localStorage.setItem("eyebot_checkin_date", new Date().toLocaleDateString("en-CA"));
  localStorage.setItem("eyebot_rail_pinned", "1");
  // NB: a fresh context has no eyebot_tour_seen, so the first load is genuinely first-run.
  // We deliberately do NOT clear it here — that would also wipe the value the app persists on
  // finish, breaking the show-once reload check below.
}, studentUser);
await ctx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
const JSON_OK = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
await ctx.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
await ctx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(studentUser)));
// customized avatar → satisfies the third gate AND feeds the Eyecon narrator avatar.
await ctx.route("**/api/avatar", (r) => r.fulfill(JSON_OK({ config: {}, axes: {}, customized: true })));
await ctx.route("**/api/progress", (r) => r.fulfill(JSON_OK({
  xp: 1240, level: 7, streak: 4, daily_goal: 100, xp_today: 60,
  streak_detail: { current: 4, best: 9, tier: "First Light", next_tier: "Clear View", to_next: 1, done_today: false, week: [] },
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

await page.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });

// 1) It fires on the first dashboard landing, on the welcome step, with the Eyecon narrator.
await tour.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
check(await tour.count() === 1, "tour overlay fires on the first /dashboard landing");
check(await stepAttr() === "welcome", "starts on the welcome step");
check(await page.locator(".tour-head .eyecon-wrap").count() === 1, "Eyecon narrator avatar renders in the card");
check(((await page.locator(".tour-title").first().textContent()) ?? "").includes("Welcome"), "welcome copy is shown");
check((await page.locator('[data-testid="tour-next"]').textContent()) === "Next →", "advance CTA reads 'Next →' (not the finale label)");

// 2) Walk the whole student walkthrough (no analytics stop for a student).
const steps = ["welcome", "modes", "streak", "badges", "account", "tutor", "cases", "flashcards", "leaderboard", "finish"];
const routeOf = { tutor: "/chat", cases: "/cases", flashcards: "/flashcards", leaderboard: "/leaderboard", finish: "/dashboard" };
for (let i = 1; i < steps.length; i++) {
  await page.locator('[data-testid="tour-next"]').click();
  // For cross-route steps, wait for the client navigation to settle before asserting the URL
  // (data-step flips synchronously with setIndex while router.push resolves asynchronously).
  if (routeOf[steps[i]]) {
    await page.waitForURL((u) => new URL(u).pathname === routeOf[steps[i]], { timeout: 20000 }).catch(() => {});
  }
  await page.waitForFunction(
    (s) => document.querySelector('[data-testid="tour"]')?.getAttribute("data-step") === s,
    steps[i], { timeout: 20000 },
  ).catch(() => {});
  check(await stepAttr() === steps[i], `advances to the "${steps[i]}" step`);
  if (routeOf[steps[i]]) {
    check(new URL(page.url()).pathname === routeOf[steps[i]], `navigated to ${routeOf[steps[i]]} for the "${steps[i]}" step`);
  }
}

// 3) Finale label + end + persistence.
check((await page.locator('[data-testid="tour-next"]').textContent()) === "Let's go!", "finale CTA reads \"Let's go!\"");
await page.locator('[data-testid="tour-next"]').click();
await tour.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
check(await tour.count() === 0, "tour ends after the finale");
check(await page.evaluate(() => localStorage.getItem("eyebot_tour_seen")) === "true", "eyebot_tour_seen persisted true on finish");

// 4) Show-once: it does not reappear on reload.
await page.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check(await tour.count() === 0, "tour does NOT reappear after completion (show-once invariant)");

await b.close();
if (failed) { console.error("\nTOUR ASSERT: FAILURES ABOVE"); process.exit(1); }
console.log("\nTOUR ASSERT: all checks passed.");
