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
  xp: 1240, hearts: 3, level: 7, streak: 4, session_count: 18,
  learning_velocity: "improving",
  weak_topics: ["Glaucoma staging", "Cataract grading"],
  topic_performance: [
    { topic: "anterior_segment", score: 0.82 },
    { topic: "glaucoma", score: 0.55 },
    { topic: "retina", score: 0.7 },
  ],
  sessions: [
    { session_id: "s1", timestamp: new Date(Date.now() - 3600e3).toISOString(), topic: "glaucoma", summary: "Acute angle closure.", mode: "case" },
    { session_id: "s2", timestamp: new Date(Date.now() - 90000e3).toISOString(), topic: "retina", summary: "OCT layers.", mode: "chat" },
  ],
})));
await navCtx.route("**/api/cases", (r) => r.fulfill(JSON_OK({ cases: [
  { case_id: "C001", title: "Sudden painful red eye", difficulty: "intermediate", topic: "Glaucoma", estimated_minutes: 12, patient: { name: "Mdm Tan", age: 64, presenting_complaint: "Acute pain with halos" } },
  { case_id: "C002", title: "Gradual vision loss", difficulty: "beginner", topic: "Cataract", estimated_minutes: 10, patient: { name: "Mr Lim", age: 71, presenting_complaint: "Blurred near vision" } },
  { case_id: "C003", title: "Flashes and floaters", difficulty: "advanced", topic: "Retina", estimated_minutes: 14, patient: { name: "Ms Wong", age: 55, presenting_complaint: "New floaters since yesterday" } },
] })));
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

// cases: the Atlas Map renders and a region pin filters the case list.
await np.setViewportSize({ width: 1440, height: 900 });
await np.goto(base + "/cases", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="case-list"] .aurora-case', { timeout: 15000 });
if ((await np.locator(".aurora-atlas-plate").count()) < 1) { console.error("FAIL: Atlas Map not rendered"); process.exit(1); }
const allCases = await np.locator('[data-testid="case-list"] .aurora-case').count();
await np.locator('.aurora-pin:has-text("Optic disc")').click();
await np.waitForTimeout(350);
const regionCases = await np.locator('[data-testid="case-list"] .aurora-case').count();
if (!(regionCases >= 1 && regionCases < allCases)) {
  console.error(`FAIL: region filter did not narrow the list (all=${allCases}, region=${regionCases})`); process.exit(1);
}
console.log("PASS: Atlas Map region filters the case list");

// tutor: lavender wash, composer renders, the EyeBot avatar uses the Spark Eye logo, one h1.
await np.goto(base + "/chat", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".aurora-chat-thread", { timeout: 15000 });
const wash = await np.locator(".aurora-chat-thread").evaluate((el) => getComputedStyle(el).backgroundImage);
if (!wash.includes("linear-gradient")) { console.error(`FAIL: chat lavender wash missing (bg=${wash})`); process.exit(1); }
if ((await np.locator(".aurora-composer").count()) < 1) { console.error("FAIL: composer not rendered"); process.exit(1); }
if ((await np.locator('.aurora-msg.is-eyebot .aurora-msg-avatar [data-testid="aurora-logo"]').count()) < 1) {
  console.error("FAIL: EyeBot avatar not using the logo"); process.exit(1);
}
const chatH1 = await np.locator("main h1").count();
if (chatH1 !== 1) { console.error(`FAIL: chat main h1 count = ${chatH1}`); process.exit(1); }
console.log("PASS: Tutor chat — lavender wash, composer, logo avatar, one h1");

// SSE: mock /api/chat as an event-stream; sending must append the streamed reply
// through the new composer + thread (proves the streaming reader path survived the rebuild).
await navCtx.route("**/api/chat", (r) => r.fulfill({
  status: 200,
  contentType: "text/event-stream",
  body: 'data: {"text":"The optic "}\n\ndata: {"text":"disc is pale."}\n\ndata: [DONE]\n\n',
}));
await np.goto(base + "/chat", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".aurora-composer-field", { timeout: 15000 });
await np.locator(".aurora-composer-field").fill("Tell me about the optic disc");
await np.locator(".aurora-send").click();
await np.waitForFunction(() => document.body.innerText.includes("The optic disc is pale."), { timeout: 8000 });
console.log("PASS: Tutor SSE stream appends the assistant reply");

// progress: one h1, mastery bars, an activity heatmap, no 390 overflow.
await np.setViewportSize({ width: 1440, height: 900 });
await np.goto(base + "/progress", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".aurora-prog .aurora-progress", { timeout: 15000 });
const progH1 = await np.locator("main h1").count();
if (progH1 !== 1) { console.error(`FAIL: progress main h1 count = ${progH1}`); process.exit(1); }
if ((await np.locator(".aurora-prog .aurora-progress").count()) < 1) { console.error("FAIL: mastery bars missing"); process.exit(1); }
if ((await np.locator(".aurora-heatmap").count()) < 1) { console.error("FAIL: activity heatmap missing"); process.exit(1); }
await np.setViewportSize({ width: 390, height: 844 });
await np.waitForTimeout(350);
const progOverflow = await np.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (progOverflow > 2) { console.error(`FAIL: progress horizontal overflow at 390px = ${progOverflow}px`); process.exit(1); }
console.log("PASS: Progress — one h1, mastery bars, heatmap, no 390 overflow");

await b.close();
