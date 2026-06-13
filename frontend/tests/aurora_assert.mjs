import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();

// scratch route renders the logo with a stable testid
await p.goto(base + "/aurora-scratch");
const logo = await p.locator('[data-testid="aurora-logo"]').count();
if (logo < 1) { console.error("FAIL: logo not rendered"); process.exit(1); }
console.log("PASS: logo renders");

// reduced motion (OS-level): the pure-CSS @media (prefers-reduced-motion: reduce)
// rule stops the sweep with no JS dependency — deterministic and independent of the
// legacy motion provider (removed in Phase 1) that still also writes html[data-motion].
await p.emulateMedia({ reducedMotion: "reduce" });
await p.goto(base + "/aurora-scratch");
await p.waitForSelector('[data-testid="aurora-surface"]');
const animationName = await p.locator('[data-testid="aurora-surface"]').evaluate(
  (el) => getComputedStyle(el).animationName,
);
if (animationName !== "none") {
  console.error(`FAIL: reduced motion did not stop animation (animationName=${animationName})`);
  process.exit(1);
}
console.log("PASS: reduced motion stops gradient animation");

// authenticated shell: the Atlas Rail renders role-gated nav and routes on click.
const studentUser = {
  full_name: "Test Student", email: "student@snec.com.sg", student_id: "S001",
  role: "student", student_role: "OA", must_change: false,
};
const navCtx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await navCtx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_checkin_date", new Date().toDateString());
  localStorage.setItem("eyebot_tour_seen", "true");
}, studentUser);
await navCtx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
const JSON_OK = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
await navCtx.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
await navCtx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(studentUser)));
await navCtx.route("**/api/progress", (r) => r.fulfill(JSON_OK({
  xp: 0, hearts: 3, level: 1, streak: 4, session_count: 0,
  learning_velocity: "stable", weak_topics: [], topic_performance: [], sessions: [],
})));
const np = await navCtx.newPage();
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
// wait for the rail to actually populate (first dev compile can be slow)
await np.waitForSelector('.aurora-navitem:has-text("Dashboard")', { timeout: 15000 });
for (const label of ["Dashboard", "Tutor", "Cases", "Flashcards", "Progress"]) {
  const count = await np.locator(`.aurora-navitem:has-text("${label}")`).count();
  if (count < 1) { console.error(`FAIL: Atlas Rail missing "${label}"`); process.exit(1); }
}
await np.locator('.aurora-navitem:has-text("Cases")').first().click();
await np.waitForURL("**/cases", { timeout: 6000 });
console.log("PASS: Atlas Rail renders nav and routes to /cases");

// dashboard structure: one h1, an NBA card, exactly three stat cards.
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="nba-card"]', { timeout: 15000 });
const h1count = await np.locator("main h1").count();
if (h1count !== 1) { console.error(`FAIL: dashboard main h1 count = ${h1count}`); process.exit(1); }
const statCards = await np.locator('[data-testid="stat-card"]').count();
if (statCards !== 3) { console.error(`FAIL: stat-card count = ${statCards}`); process.exit(1); }
console.log("PASS: dashboard has one h1, an NBA card, three stat cards");

// mobile: no horizontal overflow at 390x844.
await np.setViewportSize({ width: 390, height: 844 });
await np.waitForTimeout(400);
const overflow = await np.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 2) { console.error(`FAIL: horizontal overflow at 390px = ${overflow}px`); process.exit(1); }
console.log("PASS: dashboard has no horizontal overflow at 390px");

await b.close();
