import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const b = await chromium.launch();

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
await navCtx.route("**/api/checkin/status", (r) => r.fulfill(JSON_OK({ streak: 4, weak_topic: "Glaucoma staging" })));
await navCtx.route("**/api/checkin/question", (r) => r.fulfill(JSON_OK({ question: "What is a normal cup-to-disc ratio?", topic: "Glaucoma" })));
await navCtx.route("**/api/checkin/answer", (r) => r.fulfill(JSON_OK({ correct: true, feedback: "Yes — about 0.3 in most eyes." })));
await navCtx.route("**/api/flashcards/generate", (r) => r.fulfill(JSON_OK([
  { card_id: "f1", front: "What is the normal IOP range?", back: "Roughly 10–21 mmHg.", topic_tag: "IOP", repetitions: 0, easiness: 2.5, interval_days: 0 },
  { card_id: "f2", front: "Name the layers of the cornea.", back: "Epithelium, Bowman, stroma, Descemet, endothelium.", topic_tag: "Anterior", repetitions: 0, easiness: 2.5, interval_days: 0 },
])));
const np = await navCtx.newPage();
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
// wait for the rail to actually populate (first dev compile can be slow)
await np.waitForSelector('.aurora-navitem:has-text("Dashboard")', { timeout: 15000 });
if ((await np.locator('[data-testid="aurora-logo"]').count()) < 1) { console.error("FAIL: Spark Eye logo not rendered in the rail"); process.exit(1); }
console.log("PASS: Spark Eye logo renders in the Atlas Rail");
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

// flashcards: deck renders, one h1, reveal flips to the rating chips.
await np.setViewportSize({ width: 1440, height: 900 });
await np.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".aurora-deck-card", { timeout: 15000 });
const deckH1 = await np.locator("main h1").count();
if (deckH1 !== 1) { console.error(`FAIL: flashcards main h1 count = ${deckH1}`); process.exit(1); }
await np.locator(".aurora-reveal-btn").click();
await np.waitForSelector(".aurora-rate-grid .aurora-rate", { timeout: 6000 });
const rateCount = await np.locator(".aurora-rate-grid .aurora-rate").count();
if (rateCount !== 4) { console.error(`FAIL: expected 4 rating chips, got ${rateCount}`); process.exit(1); }
console.log("PASS: Flashcards — deck renders, one h1, reveal shows 4 rating chips");

// SNEC co-brand: the rail carries the SNEC logo on authenticated screens.
if ((await np.locator('.aurora-snec[alt="Singapore National Eye Centre"]').count()) < 1) {
  console.error("FAIL: SNEC logo missing from the Atlas Rail"); process.exit(1);
}
console.log("PASS: SNEC logo present in the Atlas Rail");

// profile: one h1 + the reduced-motion toggle flips html[data-motion] both ways.
await np.goto(base + "/profile", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".aurora-profile-card", { timeout: 15000 });
const profH1 = await np.locator("main h1").count();
if (profH1 !== 1) { console.error(`FAIL: profile h1 count = ${profH1}`); process.exit(1); }
const motionToggle = np.locator('.aurora-profile-action[aria-pressed]').first();
await motionToggle.click();
let dm = await np.evaluate(() => document.documentElement.dataset.motion);
if (dm !== "reduce") { console.error(`FAIL: reduced-motion toggle did not set data-motion (got '${dm}')`); process.exit(1); }
await motionToggle.click();
dm = await np.evaluate(() => document.documentElement.dataset.motion);
if (dm === "reduce") { console.error("FAIL: reduced-motion toggle did not turn off"); process.exit(1); }
console.log("PASS: Profile — one h1, reduced-motion toggle flips data-motion");

// daily check-in (auth group, no rail): the question card renders with one h1.
await np.goto(base + "/checkin", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".aurora-checkin-textarea", { timeout: 15000 });
const ciH1 = await np.locator("h1").count();
if (ciH1 !== 1) { console.error(`FAIL: checkin h1 count = ${ciH1}`); process.exit(1); }
console.log("PASS: Daily check-in renders the question with one h1");

// a11y sweep: every shell route has one <main>, one <h1> in main, a <nav>, and
// no horizontal overflow at 390px.
const A11Y_ROUTES = ["/dashboard", "/chat", "/cases", "/flashcards", "/progress", "/summary", "/profile"];
await np.setViewportSize({ width: 1440, height: 900 });
for (const r of A11Y_ROUTES) {
  await np.goto(base + r, { waitUntil: "domcontentloaded" });
  await np.waitForSelector("main h1", { timeout: 15000 }); // wait for the screen body, not just the shell
  const mains = await np.locator("main").count();
  const h1s = await np.locator("main h1").count();
  const navs = await np.locator("nav").count();
  if (mains !== 1 || h1s !== 1 || navs < 1) { console.error(`FAIL: a11y landmarks on ${r} (main=${mains}, h1=${h1s}, nav=${navs})`); process.exit(1); }
}
console.log("PASS: a11y — every route has one main, one h1, a nav");
await np.setViewportSize({ width: 390, height: 844 });
for (const r of A11Y_ROUTES) {
  await np.goto(base + r, { waitUntil: "domcontentloaded" });
  await np.waitForSelector("main h1", { timeout: 15000 });
  await np.waitForTimeout(250);
  const o = await np.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o > 2) { console.error(`FAIL: 390px overflow on ${r} = ${o}px`); process.exit(1); }
}
console.log("PASS: a11y — no horizontal overflow at 390px on any route");
await np.setViewportSize({ width: 1440, height: 900 });

// reduced motion: emulate prefers-reduced-motion; a .aurora-flow surface freezes.
const rmPage = await navCtx.newPage();
await rmPage.emulateMedia({ reducedMotion: "reduce" });
await rmPage.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await rmPage.waitForSelector('[data-testid="stat-card"]', { timeout: 15000 });
const rmAnim = await rmPage.locator(".aurora-flow").first().evaluate((el) => getComputedStyle(el).animationName);
if (rmAnim !== "none") { console.error(`FAIL: reduced motion did not freeze .aurora-flow (animationName=${rmAnim})`); process.exit(1); }
console.log("PASS: reduced motion freezes the gradient animation");

// admin: AdminGuard admits an admin; the shell renders tabs + KPIs; the students
// tab lists rows; the supervisor dashboard renders KPIs + the at-risk table.
const adminUser = { full_name: "Site Admin", email: "admin@snec.com.sg", student_id: "A001", role: "admin", student_role: "", must_change: false };
const adminCtx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await adminCtx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_checkin_date", new Date().toDateString());
  localStorage.setItem("eyebot_tour_seen", "true");
}, adminUser);
await adminCtx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
await adminCtx.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
await adminCtx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(adminUser)));
await adminCtx.route("**/api/supervisor/cohort", (r) => r.fulfill(JSON_OK({ total_students: 24, total: 24, active_this_week: 17, at_risk_count: 3, weakest_topics: ["Glaucoma staging", "OCT interpretation"] })));
await adminCtx.route("**/api/supervisor/at-risk", (r) => r.fulfill(JSON_OK({ students: [{ student_id: "S009ABCDEF", last_active: new Date(Date.now() - 9 * 864e5).toISOString(), days_inactive: 9, weak_topics: ["Glaucoma staging", "OCT interpretation"], weak_count: 2 }] })));
await adminCtx.route("**/api/supervisor/insights", (r) => r.fulfill(JSON_OK({ narrative: "Cohort momentum is improving; glaucoma staging remains the weakest area." })));
await adminCtx.route("**/api/supervisor/benchmarks", (r) => r.fulfill(JSON_OK({ topics: [{ topic: "Glaucoma staging", avg_score: 0.42, student_count: 14 }, { topic: "OCT interpretation", avg_score: 0.61, student_count: 12 }] })));
await adminCtx.route("**/api/admin/token-summary", (r) => r.fulfill(JSON_OK({ total_tokens: 48213, by_student: [{ student_id: "S001", tokens: 48213 }] })));
await adminCtx.route("**/api/admin/students", (r) => r.fulfill(JSON_OK({ students: [{ student_id: "S001", full_name: "Test Student", email: "student@snec.com.sg", role: "OA", session_count: 18, streak: 6, last_active: new Date().toISOString(), learning_velocity: "improving" }] })));
await adminCtx.route("**/api/admin/approved", (r) => r.fulfill(JSON_OK({ students: [{ email: "student@snec.com.sg", full_name: "Test Student", role: "OA", added_by: "admin", added_at: new Date().toISOString(), student_id: "S001" }] })));
await adminCtx.route("**/api/admin/activity", (r) => r.fulfill(JSON_OK({ feed: [{ type: "chat", student_id: "S001", name: "Test Student", detail: "Asked about gonioscopy", timestamp: new Date().toISOString(), token_count: 412 }] })));
const ap = await adminCtx.newPage();
await ap.goto(base + "/admin", { waitUntil: "domcontentloaded" });
await ap.waitForSelector('.aurora-tab:has-text("Overview")', { timeout: 15000 });
await ap.waitForSelector('[data-testid="stat-card"]', { timeout: 8000 });
const adminH1 = await ap.locator("main h1").count();
if (adminH1 !== 1) { console.error(`FAIL: admin main h1 count = ${adminH1}`); process.exit(1); }
await ap.locator('.aurora-tab:has-text("Students")').click();
await ap.waitForSelector('[data-testid="admin-student-table"] .aurora-trow.is-clickable', { timeout: 8000 });
console.log("PASS: Admin — guard admits admin, tabs + KPIs render, students table lists rows");

// supervisor: a supervisor-role user is admitted on /supervisor (CheckInGuard sends
// admins to /admin, supervisors to /supervisor); KPIs + the at-risk table render.
const supUser = { full_name: "Cohort Supervisor", email: "sup@snec.com.sg", student_id: "V001", role: "supervisor", student_role: "", must_change: false };
const supCtx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await supCtx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_checkin_date", new Date().toDateString());
  localStorage.setItem("eyebot_tour_seen", "true");
}, supUser);
await supCtx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
await supCtx.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
await supCtx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(supUser)));
await supCtx.route("**/api/supervisor/cohort", (r) => r.fulfill(JSON_OK({ total: 24, total_students: 24, active_this_week: 17, at_risk_count: 3, weakest_topics: ["Glaucoma staging", "OCT interpretation"] })));
await supCtx.route("**/api/supervisor/at-risk", (r) => r.fulfill(JSON_OK({ students: [{ student_id: "S009ABCDEF", last_active: new Date(Date.now() - 9 * 864e5).toISOString(), days_inactive: 9, weak_topics: ["Glaucoma staging", "OCT interpretation"], weak_count: 2 }] })));
await supCtx.route("**/api/supervisor/insights", (r) => r.fulfill(JSON_OK({ narrative: "Cohort momentum is improving; glaucoma staging remains the weakest area." })));
await supCtx.route("**/api/supervisor/benchmarks", (r) => r.fulfill(JSON_OK({ topics: [{ topic: "Glaucoma staging", avg_score: 0.42, student_count: 14 }] })));
const sp = await supCtx.newPage();
await sp.goto(base + "/supervisor", { waitUntil: "domcontentloaded" });
await sp.waitForSelector('[data-testid="stat-card"]', { timeout: 15000 });
const supH1 = await sp.locator("main h1").count();
if (supH1 !== 1) { console.error(`FAIL: supervisor main h1 count = ${supH1}`); process.exit(1); }
await sp.waitForSelector(".aurora-trow.is-clickable", { timeout: 8000 });
console.log("PASS: Supervisor — KPIs + at-risk table render");

await b.close();
