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
  sessionStorage.setItem("eyebot_checkin_session", "1");
  localStorage.setItem("eyebot_tour_seen", "true");
  localStorage.setItem("eyebot_rail_pinned", "1"); // pin the auto-collapsing rail open so nav items are clickable
}, studentUser);
await navCtx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
const JSON_OK = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
await navCtx.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
await navCtx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(studentUser)));
await navCtx.route("**/api/progress", (r) => r.fulfill(JSON_OK({
  xp: 1240, xp_today: 60, daily_goal: 100, hearts: 3, level: 7, streak: 4, session_count: 18,
  learning_velocity: "improving",
  streak_detail: {
    current: 4, best: 9, freezes: 1, done_today: false,
    tier: "First Light", next_tier: "Clear View", to_next: 1,
    week: [
      { day: "Mon", date: "2026-06-22", state: "done" },
      { day: "Tue", date: "2026-06-23", state: "done" },
      { day: "Wed", date: "2026-06-24", state: "today" },
      { day: "Thu", date: "2026-06-25", state: "upcoming" },
      { day: "Fri", date: "2026-06-26", state: "upcoming" },
      { day: "Sat", date: "2026-06-27", state: "rest" },
      { day: "Sun", date: "2026-06-28", state: "rest" },
    ],
  },
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
await navCtx.route("**/api/checkin/question", (r) => r.fulfill(JSON_OK({ question_id: "OA-0", question: "What is a normal cup-to-disc ratio?", topic: "Glaucoma", options: ["About 0.3", "About 0.7", "Exactly 1.0", "About 0.9"] })));
await navCtx.route("**/api/checkin/answer", (r) => r.fulfill(JSON_OK({ correct: true, feedback: "Yes — about 0.3 in most eyes." })));
await navCtx.route("**/api/flashcards/generate**", (r) => r.fulfill(JSON_OK([
  { card_id: "f1", stem: "Normal IOP range?",
    options: ["10-21 mmHg", "0-9 mmHg", "22-30 mmHg", "31-40 mmHg"], correct: [0],
    qtype: "single", kind: "theory", explanation: "Normal IOP is 10-21 mmHg.",
    requires_explanation: false, topic_tag: "iop_nct", difficulty: "easy",
    repetitions: 0, easiness: 2.5, interval_days: 1 },
  { card_id: "f2", stem: "Why irrigate a chemical burn immediately?",
    options: ["To wash out the chemical", "To dilate the pupil", "To measure IOP", "To numb the eye"],
    correct: [0], qtype: "single", kind: "practical",
    explanation: "Immediate irrigation limits ongoing tissue damage (Category 1).",
    requires_explanation: true, topic_tag: "triage", difficulty: "medium",
    repetitions: 0, easiness: 2.5, interval_days: 1 },
])));
await navCtx.route("**/api/flashcards/complete", (r) => r.fulfill(JSON_OK({ xp: 140, level: 1 })));
const np = await navCtx.newPage();
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
// wait for the rail to actually populate (first dev compile can be slow)
await np.waitForSelector('.aurora-navitem:has-text("Dashboard")', { timeout: 15000 });
if ((await np.locator('[data-testid="aurora-logo"]').count()) < 1) { console.error("FAIL: Spark Eye logo not rendered in the rail"); process.exit(1); }
console.log("PASS: Spark Eye logo renders in the Atlas Rail");
for (const label of ["Dashboard", "Tutor", "Virtual Patients", "Flashcards"]) {
  const count = await np.locator(`.aurora-navitem:has-text("${label}")`).count();
  if (count < 1) { console.error(`FAIL: Atlas Rail missing "${label}"`); process.exit(1); }
}
// Progress + Summary were retired — assert they are gone from the rail.
for (const gone of ["Progress", "Summary"]) {
  if ((await np.locator(`.aurora-navitem:has-text("${gone}")`).count()) > 0) {
    console.error(`FAIL: Atlas Rail still shows retired "${gone}"`); process.exit(1);
  }
}
await np.locator('.aurora-navitem:has-text("Virtual Patients")').first().click();
await np.waitForURL("**/cases", { timeout: 6000 });
console.log("PASS: Atlas Rail renders nav and routes to /cases");

// home structure: the warm bento renders (one h1 greeting, streak tile, milestone
// ladder, three feature cards) and "Surprise me" reshuffles the greeting.
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="home-root"]', { timeout: 15000 });
const h1count = await np.locator("main h1").count();
if (h1count !== 1) { console.error(`FAIL: dashboard main h1 count = ${h1count}`); process.exit(1); }
if ((await np.locator('[data-testid="streak-tile"]').count()) !== 1) { console.error("FAIL: streak tile missing"); process.exit(1); }
if ((await np.locator('[data-testid="milestone-ladder"]').count()) !== 1) { console.error("FAIL: milestone ladder missing"); process.exit(1); }
if ((await np.locator('[data-testid="feature-card"]').count()) !== 3) { console.error("FAIL: expected 3 feature cards"); process.exit(1); }
const greetBefore = await np.locator('[data-testid="greeting"]').innerText();
await np.locator('button:has-text("Surprise me")').click();
await np.waitForTimeout(150);
const greetAfter = await np.locator('[data-testid="greeting"]').innerText();
if (greetBefore === greetAfter) { console.error("FAIL: 'Surprise me' did not change the greeting"); process.exit(1); }
console.log("PASS: warm home (greeting h1, streak tile, milestone ladder, 3 feature cards, reshuffle)");

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

// tutor: cosmic gradient wash, composer renders, the EyeBot avatar uses the Spark Eye logo, one h1.
// (the dark-cosmos redesign moved the wash to the parent .aurora-chat; .aurora-chat-thread is transparent.)
await np.goto(base + "/chat", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".aurora-chat", { timeout: 15000 });
const wash = await np.locator(".aurora-chat").evaluate((el) => getComputedStyle(el).backgroundImage);
if (!wash.includes("linear-gradient")) { console.error(`FAIL: chat cosmic wash missing (bg=${wash})`); process.exit(1); }
if ((await np.locator(".aurora-composer").count()) < 1) { console.error("FAIL: composer not rendered"); process.exit(1); }
if ((await np.locator('.aurora-msg.is-eyebot .aurora-msg-avatar [data-testid="aurora-logo"]').count()) < 1) {
  console.error("FAIL: EyeBot avatar not using the logo"); process.exit(1);
}
const chatH1 = await np.locator("main h1").count();
if (chatH1 !== 1) { console.error(`FAIL: chat main h1 count = ${chatH1}`); process.exit(1); }
console.log("PASS: Tutor chat — cosmic wash, composer, logo avatar, one h1");

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
await np.locator(".aurora-composer-send").click();
await np.waitForFunction(() => document.body.innerText.includes("The optic disc is pale."), { timeout: 8000 });
console.log("PASS: Tutor SSE stream appends the assistant reply");

// progress + summary were retired: /progress and /summary must 404 (no route).
await np.setViewportSize({ width: 1440, height: 900 });
for (const gone of ["/progress", "/summary"]) {
  const resp = await np.goto(base + gone, { waitUntil: "domcontentloaded" });
  const status = resp ? resp.status() : 0;
  const notFound = status === 404 || (await np.locator("text=/404|not found|page could/i").count()) > 0;
  if (!notFound) { console.error(`FAIL: retired route ${gone} still resolves (status ${status})`); process.exit(1); }
}
console.log("PASS: retired /progress and /summary no longer resolve");

// flashcards: "Console" no-submit study loop — a single-answer tap reveals INSTANTLY
// (no Check/submit button), and on reason cards an OPTIONAL reflection box appears after
// the reveal and never gates advance. Ends on an X/N results screen.
await navCtx.route("**/api/flashcards/check", (r) => r.fulfill(JSON_OK({ score: 88, feedback: "Good reasoning — immediate irrigation limits damage.", mock_mode: true })));
// topics: 8 one-per-topic CLINICAL decks (difficulty collapsed; set_key == topic_key)
// so the fan paginates (8 + Mixed = 9 > 7).
await navCtx.route("**/api/flashcards/topics", (r) => r.fulfill(JSON_OK({ sets: [
  ["ocular_emergencies", "Ocular Emergencies"], ["red_eye", "Red Eye Differential"],
  ["triage", "Triage Categories"], ["history_taking", "History Taking"],
  ["distance_va", "Distance Visual Acuity"], ["near_vision", "Near Vision"],
  ["pinhole", "Pinhole Testing"], ["iop_nct", "IOP & Non-Contact Tonometry"],
].map(([topic_key, label]) => ({ set_key: topic_key, topic_key, label, difficulty: "mixed", total: 20, completed: 0 })) })));

await np.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="flash-setup"]', { timeout: 15000 });
const fcH1 = await np.locator("main h1").count();
if (fcH1 !== 1) { console.error(`FAIL: flashcards main h1 count = ${fcH1}`); process.exit(1); }
// immersive: the rail falls away on /flashcards (like the Tutor); exit affordance present.
if ((await np.locator('[data-testid="flash-exit"]').count()) < 1) { console.error("FAIL: flashcards exit affordance missing"); process.exit(1); }

// single-step selection: no difficulty/length step — /flashcards lands straight on
// the auto-rotating topic fan (Mixed + the 8 mocked topics) with pagination. One
// click on any card starts that topic's deck (10 cards, all tiers mixed).
await np.waitForSelector('[data-testid="flash-fan"]', { timeout: 15000 });
if ((await np.locator('[data-testid="flash-continue"]').count()) > 0) {
  console.error("FAIL: the difficulty/length step still exists — selection should be topic-only"); process.exit(1);
}
const fanCount = await np.locator('[data-testid="flash-pick"]').count();
if (fanCount !== 9) { console.error(`FAIL: topic fan card count = ${fanCount} (want 9)`); process.exit(1); }
if ((await np.locator('[data-testid="flash-prev"]').count()) < 1) { console.error("FAIL: topic fan pagination arrows missing"); process.exit(1); }
console.log("PASS: Flashcards — single-step topic fan (Mixed + topics, no difficulty step)");
// Emulate reduced motion BEFORE interacting: it freezes the continuously-flowing
// ("river") topic fan so the pick-click lands on a STABLE card, and collapses the
// study charge/flip to a fast, deterministic path. study: a single-answer tap locks
// an INSTANT ✓/✗ verdict on the FRONT face, a suspense beat plays, then the card
// FLIPS to a full-bleed back face carrying the model answer ("Findings") + a payoff.
await np.emulateMedia({ reducedMotion: "reduce" });
await np.waitForTimeout(450); // let the river freeze to a static fan before clicking
await np.locator('[data-card-id="triage"]').click();
await np.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });

// Card 1 (plain): tap an option → flip → back face shows "Findings" + payoff. There
// is NO Check/submit button. Next is held for a short settle, then enables.
await np.locator('[data-testid="flash-option"]').first().click();
await np.waitForSelector('[data-testid="flash-reveal-back"]', { timeout: 8000 });
if ((await np.locator('[data-testid="flash-check"]').count()) > 0) {
  console.error("FAIL: flashcards must not have a Check/submit button"); process.exit(1);
}
if ((await np.locator('.flash-compare-label:has-text("Findings")').count()) < 1) {
  console.error("FAIL: flashcards model answer not revealed on the back face"); process.exit(1);
}
if ((await np.locator('[data-testid="flash-payoff"]').count()) < 1) {
  console.error("FAIL: flashcards reveal is missing the gamification payoff"); process.exit(1);
}
if (await np.locator('[data-testid="flash-advance"]').isEnabled()) {
  console.error("FAIL: Next should be settle-gated immediately after the flip"); process.exit(1);
}
console.log("PASS: flashcards — plain tap flips to a full-bleed payoff; Next is settle-gated");
await np.locator('[data-testid="flash-advance"]').click(); // auto-waits out the settle

// Card 2 (requires_explanation): tapping shows the verdict + a reasoning box on the
// FRONT face (NO model yet, NO Next). Charging the reveal flips to the back face.
await np.waitForSelector('[data-testid="flash-option"]', { timeout: 8000 });
await np.locator('[data-testid="flash-option"]').first().click();
await np.waitForSelector('[data-testid="flash-reason"]', { timeout: 8000 });
// Both faces live in the DOM for the 3D flip, so assert VISIBILITY, not presence:
// before the flip the back face (model + Next) is display:none under reduced motion
// (rotated away with backface-hidden in full motion).
if (await np.locator('.flash-compare-label:has-text("Findings")').isVisible()) {
  console.error("FAIL: model answer shown before the learner's reasoning on a reason card"); process.exit(1);
}
if (await np.locator('[data-testid="flash-advance"]').isVisible()) {
  console.error("FAIL: Next should not be visible until the reveal is charged"); process.exit(1);
}
await np.locator('[data-testid="flash-reason"]').fill("Immediate irrigation limits ongoing damage.");
await np.locator('[data-testid="flash-reveal-model"]').click();
await np.waitForSelector('.flash-compare-label:has-text("Findings")', { timeout: 8000 });
console.log("PASS: flashcards — reason card flips to the model AFTER the learner's explanation");
await np.locator('[data-testid="flash-advance"]').click(); // auto-waits out the settle

await np.emulateMedia({ reducedMotion: "no-preference" });

// Results: instant "X / N correct".
await np.waitForSelector('[data-testid="flash-results-score"]', { timeout: 8000 });
const score = await np.locator('[data-testid="flash-results-score"]').innerText();
if (!/\d+\s*\/\s*\d+/.test(score)) { console.error(`FAIL: results score missing (got '${score}')`); process.exit(1); }
console.log("PASS: flashcards — deck ends on an X/N results screen");

// per-topic hue still exposed on .flash-root (unchanged assertion)
const topicHueVal = await np.evaluate(() => {
  const root = document.querySelector(".flash-root");
  return root ? getComputedStyle(root).getPropertyValue("--flash-topic-hue").trim() : "";
});
if (!topicHueVal || Number.isNaN(Number(topicHueVal))) {
  console.error(`FAIL: flashcards --flash-topic-hue missing/NaN (got '${topicHueVal}')`); process.exit(1);
}
console.log("PASS: flashcards exposes per-topic --flash-topic-hue =", topicHueVal);

// persistence hygiene: the ephemeral flashcards DECK (["flashcards", …]) must NOT be
// written to the offline cache — it stales SM-2/no-repeat and is the shape-drift that
// white-screened the page. Other queries (topics, progress, …) still persist, proving
// the read is non-vacuous. (The deck query resolved during the flow above.)
const persistedKeys = await np.evaluate(async () => {
  const read = () => new Promise((resolve) => {
    let req; try { req = indexedDB.open("eyebot", 1); } catch { return resolve(null); }
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      let tx; try { tx = db.transaction("qcache", "readonly"); } catch { return resolve(null); }
      const g = tx.objectStore("qcache").get("EYEBOT_QUERY_CACHE");
      g.onsuccess = () => resolve(g.result ?? null);
      g.onerror = () => resolve(null);
    };
  });
  for (let i = 0; i < 80; i++) { // wait out the persister's throttled write
    const raw = await read();
    if (raw) { try { const qs = JSON.parse(raw)?.clientState?.queries ?? []; if (qs.length) return qs.map((q) => q.queryKey); } catch {} }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
});
if (!persistedKeys) { console.error("FAIL: query cache never persisted to IndexedDB (cannot verify deck exclusion)"); process.exit(1); }
if (persistedKeys.some((k) => Array.isArray(k) && k[0] === "flashcards")) {
  console.error("FAIL: the ephemeral flashcards deck was written to the offline cache:", JSON.stringify(persistedKeys)); process.exit(1);
}
console.log("PASS: flashcards — deck NOT persisted; offline cache holds", JSON.stringify(persistedKeys));

// SNEC co-brand: the rail carries the SNEC logo on authenticated screens. Flashcards
// is immersive (no rail), so return to a rail route before asserting the logo.
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector('.aurora-navitem:has-text("Dashboard")', { timeout: 15000 });
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

// daily check-in (auth group, no rail): the MCQ icebreaker renders its 4 options + one h1.
// (the redesign replaced the free-text textarea with a tap-to-answer multiple choice.)
await np.goto(base + "/checkin", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".aurora-checkin-option", { timeout: 15000 });
const ciOpts = await np.locator(".aurora-checkin-options .aurora-checkin-option").count();
if (ciOpts !== 4) { console.error(`FAIL: checkin expected 4 MCQ options, got ${ciOpts}`); process.exit(1); }
const ciH1 = await np.locator("h1").count();
if (ciH1 !== 1) { console.error(`FAIL: checkin h1 count = ${ciH1}`); process.exit(1); }
console.log("PASS: Daily check-in renders the MCQ question with one h1");

// a11y sweep: every shell route has one <main>, one <h1> in main, a <nav>, and
// no horizontal overflow at 390px.
const A11Y_ROUTES = ["/dashboard", "/chat", "/cases", "/flashcards", "/profile"];
await np.setViewportSize({ width: 1440, height: 900 });
for (const r of A11Y_ROUTES) {
  await np.goto(base + r, { waitUntil: "domcontentloaded" });
  await np.waitForSelector("main h1", { timeout: 15000 }); // wait for the screen body, not just the shell
  const mains = await np.locator("main").count();
  const h1s = await np.locator("main h1").count();
  if (r === "/chat" || r === "/flashcards") {
    // Immersive routes: the Atlas Rail falls away (no <nav>); navigation is a
    // labelled back/exit affordance. Demand exactly one main + one h1 + that exit.
    const back = await np.locator(".aurora-chat-back, [data-testid='flash-exit']").count();
    if (mains !== 1 || h1s !== 1 || back < 1) { console.error(`FAIL: a11y landmarks on ${r} (main=${mains}, h1=${h1s}, back=${back})`); process.exit(1); }
  } else {
    const navs = await np.locator("nav").count();
    if (mains !== 1 || h1s !== 1 || navs < 1) { console.error(`FAIL: a11y landmarks on ${r} (main=${mains}, h1=${h1s}, nav=${navs})`); process.exit(1); }
  }
}
console.log("PASS: a11y — every route has one main + one h1; rail nav off-chat, back link on the immersive Tutor");
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
await rmPage.waitForSelector('[data-testid="streak-tile"]', { timeout: 15000 });
const rmAnim = await rmPage.locator(".hm-iris").first().evaluate((el) => getComputedStyle(el).animationName);
if (rmAnim !== "none") { console.error(`FAIL: reduced motion did not freeze the mascot (animationName=${rmAnim})`); process.exit(1); }
console.log("PASS: reduced motion freezes the home mascot animation");

// admin: AdminGuard admits an admin; the dark ConsoleRail nav + KPIs render; the
// Students route lists rows. (The old in-page pill tabs were replaced by the
// ConsoleRail's .aurora-navitem links across /admin, /admin/students, …)
const adminUser = { full_name: "Site Admin", email: "admin@snec.com.sg", student_id: "A001", role: "admin", student_role: "", must_change: false };
const adminCtx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await adminCtx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  sessionStorage.setItem("eyebot_checkin_session", "1");
  localStorage.setItem("eyebot_tour_seen", "true");
  localStorage.setItem("eyebot_rail_pinned", "1"); // pin the auto-collapsing rail open so nav items are clickable
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
await ap.waitForSelector('.aurora-navitem:has-text("Overview")', { timeout: 15000 });
await ap.waitForSelector('[data-testid="stat-card"]', { timeout: 8000 });
const adminH1 = await ap.locator("main h1").count();
if (adminH1 !== 1) { console.error(`FAIL: admin main h1 count = ${adminH1}`); process.exit(1); }
// The cohort engagement card (relocated from the retired student Progress page) renders.
if ((await ap.locator('[aria-label="Cohort engagement"]').count()) < 1) {
  console.error("FAIL: admin overview missing the Cohort engagement card"); process.exit(1);
}
console.log("PASS: Admin overview shows the relocated Cohort engagement card");
await ap.locator('.aurora-navitem:has-text("Students")').click();
await ap.waitForSelector('[data-testid="admin-student-table"] .aurora-trow.is-clickable', { timeout: 8000 });
console.log("PASS: Admin — guard admits admin, ConsoleRail nav + KPIs render, students table lists rows");

// supervisor: a supervisor-role user is admitted on /supervisor (CheckInGuard sends
// admins to /admin, supervisors to /supervisor); KPIs + the at-risk table render.
const supUser = { full_name: "Cohort Supervisor", email: "sup@snec.com.sg", student_id: "V001", role: "supervisor", student_role: "", must_change: false };
const supCtx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await supCtx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  sessionStorage.setItem("eyebot_checkin_session", "1");
  localStorage.setItem("eyebot_tour_seen", "true");
  localStorage.setItem("eyebot_rail_pinned", "1"); // pin the auto-collapsing rail open so nav items are clickable
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

// regression (prod incident 2026-06-27): a pre-MCQ deck ({front,back}, NO `options`)
// rehydrated from the offline cache must NOT reach McqCard — its options.map() would
// white-screen the page. The orchestrator filters malformed cards, degrading to the
// graceful empty state instead of the error boundary.
const staleCtx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await staleCtx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  sessionStorage.setItem("eyebot_checkin_session", "1");
  localStorage.setItem("eyebot_tour_seen", "true");
  localStorage.setItem("eyebot_rail_pinned", "1");
}, studentUser);
await staleCtx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
await staleCtx.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
await staleCtx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(studentUser)));
// old-shaped cards: front/back, no options/stem (what a pre-MCQ deploy returned).
await staleCtx.route("**/api/flashcards/generate**", (r) => r.fulfill(JSON_OK([
  { card_id: "stale1", front: "Normal IOP range?", back: "10-21 mmHg", topic_tag: "iop_nct" },
])));
const stp = await staleCtx.newPage();
await stp.emulateMedia({ reducedMotion: "reduce" }); // freeze the flowing fan so the pick-click is stable
const staleErrors = [];
stp.on("pageerror", (e) => staleErrors.push(String(e)));
await stp.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
await stp.waitForSelector('[data-testid="flash-setup"]', { timeout: 15000 });
await stp.waitForSelector('[data-testid="flash-fan"]', { timeout: 15000 });
await stp.locator('[data-card-id="__mixed"]').click();
// graceful empty state appears; the study stage and the error boundary never do.
await stp.waitForSelector(".flash-msg", { timeout: 15000 });
await stp.waitForTimeout(600); // let any (mis)render settle
if ((await stp.locator('h2:has-text("Something went wrong")').count()) > 0) {
  console.error("FAIL: stale-shaped flashcard crashed the page (error boundary shown)"); process.exit(1);
}
if ((await stp.locator('[data-testid="study-stage"]').count()) > 0) {
  console.error("FAIL: malformed card reached the study stage instead of being filtered"); process.exit(1);
}
if (staleErrors.some((e) => /reading 'map'|reading "map"|\.map/.test(e))) {
  console.error("FAIL: stale-shaped flashcard threw a .map() error:", staleErrors.join(" | ")); process.exit(1);
}
console.log("PASS: flashcards — stale/old-shaped cards degrade gracefully (no white-screen)");

await b.close();
