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
  localStorage.setItem("eyebot_selena_onboarded", "1"); // returning, already-onboarded student ⇒ the welcome-Studio gate (CheckInGuard) must not redirect /profile etc. when a GET reports customized:false
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
  // ricoe C2: a LOCKED case is still returned so it shows (as a locked card) attached to its eye part.
  { case_id: "C004", title: "Advanced disc assessment", difficulty: "advanced", topic: "Glaucoma optic disc", estimated_minutes: 15, locked: true, patient: { name: "Mr Ng", age: 68, presenting_complaint: "Progressive field loss" } },
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
// The branded Selena splash shows while the app-shell chunk loads on first paint.
await np.goto(base + "/dashboard", { waitUntil: "commit" });
const splash = np.locator('[data-testid="brand-splash"]');
try {
  await splash.waitFor({ state: "attached", timeout: 5000 });
  const role = await splash.getAttribute("role");
  if (role !== "status") { console.error(`FAIL: BrandSplash missing role=status (got ${role})`); process.exit(1); }
  if ((await splash.locator('[data-testid="selena-logo"]').count()) < 1) { console.error("FAIL: BrandSplash has no SelenaLogo"); process.exit(1); }
  console.log("PASS: BrandSplash — branded loading boundary with a grooving SelenaLogo");
} catch {
  console.error("FAIL: BrandSplash loading boundary never appeared on first paint");
  process.exit(1);
}
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

// home structure: the warm bento renders (one non-empty h1 greeting, streak tile,
// milestone ladder, three feature cards). The greeting card is deliberately chrome-
// light (no eyebrow / CTA row — stripped 2026-07-10), so only the h1 is asserted.
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="home-root"]', { timeout: 15000 });
const h1count = await np.locator("main h1").count();
if (h1count !== 1) { console.error(`FAIL: dashboard main h1 count = ${h1count}`); process.exit(1); }
if ((await np.locator('[data-testid="streak-tile"]').count()) !== 1) { console.error("FAIL: streak tile missing"); process.exit(1); }
if ((await np.locator('[data-testid="milestone-ladder"]').count()) !== 1) { console.error("FAIL: milestone ladder missing"); process.exit(1); }
if ((await np.locator('[data-testid="feature-card"]').count()) !== 3) { console.error("FAIL: expected 3 feature cards"); process.exit(1); }
const greetText = (await np.locator('[data-testid="greeting"]').innerText()).trim();
if (!greetText) { console.error("FAIL: greeting h1 is empty"); process.exit(1); }
console.log("PASS: warm home (greeting h1, streak tile, milestone ladder, 3 feature cards)");

// Streak badge collection (Selena everywhere): the milestone ladder is a shelf of generated
// collectible medallions. With streak=4, First Light is collected, Clear View is next, the
// other four are locked. Verifies the state mapping AND that the generated art asset is served.
const ladder = '[data-testid="milestone-ladder"]';
if ((await np.locator(`${ladder} .hm-badge`).count()) !== 6) { console.error("FAIL: expected 6 streak badges"); process.exit(1); }
if ((await np.locator(`${ladder} .hm-badge-art`).count()) !== 6) { console.error("FAIL: streak badges missing medallion art"); process.exit(1); }
const bCollected = await np.locator(`${ladder} .hm-badge[data-state="collected"]`).count();
const bNext = await np.locator(`${ladder} .hm-badge[data-state="next"]`).count();
const bLocked = await np.locator(`${ladder} .hm-badge[data-state="locked"]`).count();
if (bCollected !== 1 || bNext !== 1 || bLocked !== 4) { console.error(`FAIL: badge states (collected=${bCollected} next=${bNext} locked=${bLocked})`); process.exit(1); }
const badgeServed = await np.evaluate(async () => (await fetch("/brand/badges/first-light.jpg")).ok);
if (!badgeServed) { console.error("FAIL: badge art /brand/badges/first-light.jpg not served"); process.exit(1); }
console.log("PASS: Selena everywhere — streak badge collection (6 generated medallions; collected/next/locked; art served)");

// feature cards must NAVIGATE on tap (ricoe D3): the perpetual drift + 3D projection
// used to swallow the click and leave the user stuck on the dashboard. A tap on the
// carousel now routes to a feature (nearest card, resolved at the stage).
await np.waitForSelector('[data-testid="feature-carousel"]', { timeout: 15000 });
const cbox = await np.locator('[data-testid="feature-carousel"]').boundingBox();
await np.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
await np.waitForTimeout(600);
const featPath = new URL(np.url()).pathname;
if (!["/chat", "/cases", "/flashcards"].includes(featPath)) {
  console.error(`FAIL: tapping a feature card did not route (still ${featPath})`); process.exit(1);
}
console.log(`PASS: feature card tap routes to a feature (${featPath})`);
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="home-root"]', { timeout: 15000 });

// mobile: no horizontal overflow at 390x844.
await np.setViewportSize({ width: 390, height: 844 });
await np.waitForTimeout(400);
const overflow = await np.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 2) { console.error(`FAIL: horizontal overflow at 390px = ${overflow}px`); process.exit(1); }
console.log("PASS: dashboard has no horizontal overflow at 390px");

// Animated Selena logo greets on Home (logo→raster brief): the rest frame IS the
// homepage iris.png, running the calm "hello" motion.
const homeLogo = np.locator('[data-testid="selena-logo"]').first();
if ((await homeLogo.count()) < 1) { console.error("FAIL: SelenaLogo missing on the Home greeting"); process.exit(1); }
const homeMotion = await homeLogo.getAttribute("data-motion");
if (homeMotion !== "hello") { console.error(`FAIL: Home SelenaLogo motion is '${homeMotion}', expected 'hello'`); process.exit(1); }
const homeRestSrc = (await homeLogo.locator(".selena-logo-rest").getAttribute("src")) ?? "";
if (!/\/brand\/iris\.png/.test(homeRestSrc)) { console.error(`FAIL: Home SelenaLogo rest frame is not iris.png (src=${homeRestSrc})`); process.exit(1); }
console.log("PASS: Home — animated SelenaLogo (hello) on the iris.png rest frame");

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

// ricoe C2: locked cases stay attached to their eye part — the Optic disc region still
// shows the locked case as a (non-startable) locked card, so no part reads as empty.
if ((await np.locator('[data-testid="case-list"] .aurora-case--locked').count()) < 1) {
  console.error("FAIL: locked case must still show (as a locked card) in its eye region"); process.exit(1);
}
console.log("PASS: locked cases still show attached to their part of the eye (ricoe C2)");

// tutor greeting landing (ricoe A2): /chat OPENS on the greeting landing (hello h1 +
// prompt + recent sessions), not the thread. cosmic wash, composer, SNEC co-brand, one h1.
await np.goto(base + "/chat", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".aurora-chat", { timeout: 15000 });
const wash = await np.locator(".aurora-chat").evaluate((el) => getComputedStyle(el).backgroundImage);
if (!wash.includes("linear-gradient")) { console.error(`FAIL: chat cosmic wash missing (bg=${wash})`); process.exit(1); }
if ((await np.locator('[data-testid="tutor-landing"]').count()) < 1) { console.error("FAIL: tutor greeting landing not shown on /chat"); process.exit(1); }
if ((await np.locator(".aurora-composer").count()) < 1) { console.error("FAIL: composer not rendered"); process.exit(1); }
// Branding lock (ricoe §6.6 / E2): the rail (which carries the lockup) is hidden on the
// immersive Tutor, so the FULL EyeBot + SNEC co-brand lockup must be present on the landing
// — a lone SNEC mark is not a lockup. Assert BOTH marks inside the landing.
const ldEb = await np.locator('[data-testid="tutor-landing"] .aurora-cobrand-mark-wrap [data-testid="selena-logo"]').count();
const ldEbSrc = (await np.locator('[data-testid="tutor-landing"] .aurora-cobrand-mark-wrap .selena-logo-rest').getAttribute("src")) ?? "";
if (ldEb >= 1 && !/\/brand\/iris\.png/.test(ldEbSrc)) { console.error(`FAIL: CoBrand mark is not the iris.png Selena (src=${ldEbSrc})`); process.exit(1); }
const ldSnec = await np.locator('[data-testid="tutor-landing"] .aurora-snec').count();
if (ldEb < 1) { console.error("FAIL: EyeBot mark missing on the Tutor landing (lone SNEC is not a lockup)"); process.exit(1); }
if (ldSnec < 1) { console.error("FAIL: SNEC mark missing on the Tutor landing"); process.exit(1); }
// A waving Selena greets above the hello (Branding lock, 2026-07-06) — the SAME iris.png
// mascot as the Home greeting card (identical look, per Caleb), running the wave animation.
const iris = np.locator('[data-testid="tutor-landing"] .tl-iris');
if ((await iris.count()) < 1) { console.error("FAIL: waving Selena greeter missing on the Tutor landing"); process.exit(1); }
const irisSrc = (await iris.getAttribute("src")) ?? "";
if (!/\/brand\/iris\.png/.test(irisSrc)) { console.error(`FAIL: Tutor mascot is not the homepage iris.png (src=${irisSrc})`); process.exit(1); }
const waveAnim = await iris.evaluate((el) => getComputedStyle(el).animationName).catch(() => "");
if (waveAnim !== "tl-iris-wave") { console.error(`FAIL: Selena not waving (animationName=${waveAnim})`); process.exit(1); }
const chatH1 = await np.locator("main h1").count();
if (chatH1 !== 1) { console.error(`FAIL: chat main h1 count = ${chatH1}`); process.exit(1); }
console.log("PASS: Tutor greeting landing — cosmic wash, prompt, full EyeBot + SNEC lockup, waving Selena, one h1");

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
// asking from the landing cross-faded into the live thread (ricoe A2); the EyeBot reply
// avatar is the default Selena mascot (ricoe A3).
if ((await np.locator('.aurora-msg.is-eyebot .aurora-msg-avatar img.aurora-msg-mascot').count()) < 1) {
  console.error("FAIL: EyeBot reply avatar not using the default Selena mascot"); process.exit(1);
}
console.log("PASS: Tutor landing→thread transition + SSE stream + Selena mascot reply avatar");

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
// ricoe B5: a topic pick shows an intro card (name + description) BEFORE Q1; Begin
// drops into the deck. The intro names the topic, so the title must be non-empty.
await np.waitForSelector('[data-testid="flash-intro"]', { timeout: 15000 });
if (((await np.locator('[data-testid="flash-intro"] .flash-intro-title').innerText()).trim().length) < 2) {
  console.error("FAIL: topic intro card is missing its title (ricoe B5)"); process.exit(1);
}
if ((await np.locator('[data-testid="study-stage"]').count()) > 0) {
  console.error("FAIL: study stage shown before the intro's Begin (intro was skipped)"); process.exit(1);
}
console.log("PASS: flashcards — topic intro card shows the topic name + description before Q1 (ricoe B5)");
await np.locator('[data-testid="flash-intro-begin"]').click();
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

// ── RICOE v2 D2: flashcards is "ivory & ink" (supersedes the rejected purple B6). The
// study-card FRONT is bright white (--flash-card); the reveal BACK now flips to the SAME
// bright white (2026-07-10 — the feedback face matches the question face); the canvas is
// warm greige — never the old #EDE6F8 lavender.
const d2 = await np.evaluate(() => {
  const front = document.querySelector(".flash-card .flash-face.is-front");
  const back = document.querySelector(".flash-card .flash-face.is-back");
  const root = document.querySelector(".flash-root");
  return {
    front: front ? getComputedStyle(front).backgroundColor : "",
    back: back ? getComputedStyle(back).backgroundColor : "",
    rootImg: root ? getComputedStyle(root).backgroundImage : "",
  };
});
if (d2.front !== "rgb(255, 255, 255)") {
  console.error(`FAIL: D2 study-card front face must be bright white (got '${d2.front}')`); process.exit(1);
}
if (d2.back !== "rgb(255, 255, 255)") {
  console.error(`FAIL: reveal back face must be bright white to match the study face (got '${d2.back}')`); process.exit(1);
}
if (/237,\s*230,\s*248/.test(d2.rootImg)) {
  console.error("FAIL: D2 canvas is still the purple B6 lavender (#EDE6F8)"); process.exit(1);
}
console.log("PASS: flashcards — ivory & ink (white study card, white reveal matching the front, greige canvas)");

await np.locator('[data-testid="flash-advance"]').click(); // auto-waits out the settle

// Card 2 (requires_explanation): tapping shows the verdict + a reasoning box on the
// FRONT face (NO model yet, NO Next). Charging the reveal flips to the back face.
await np.waitForSelector('[data-testid="flash-option"]', { timeout: 8000 });
await np.locator('[data-testid="flash-option"]').first().click();
// ricoe B3: two correct in a row → the loud, game-phrased combo popup fires (×2). It
// renders in the same commit as the verdict, so it's present immediately after the tap.
if ((await np.locator('[data-testid="flash-burst"]').count()) < 1) {
  console.error("FAIL: the loud combo popup did not fire on a 2× streak (ricoe B3)"); process.exit(1);
}
console.log("PASS: flashcards — loud game-phrased combo popup fires on a streak (ricoe B3)");
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

// ricoe B4: from the results screen, "New deck" returns to the topic fan (it used to
// push to /dashboard). Runs last of the study-flow checks, as it leaves the results screen.
await np.locator('button:has-text("New deck")').click();
await np.waitForSelector('[data-testid="flash-fan"]', { timeout: 8000 });
if (new URL(np.url()).pathname !== "/flashcards") { console.error(`FAIL: 'New deck' left /flashcards (${new URL(np.url()).pathname})`); process.exit(1); }
console.log("PASS: flashcards — 'New deck' returns to the topic fan");

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
// Under reduced motion the mascot swap frame is fully hidden (static rest only).
// Sample the Home mascot specifically (.hm-iris) once it's mounted AND the persisted
// reduced-motion pref has re-applied on this navigation — avoids grabbing the transient
// BrandSplash mascot mid-unmount (getComputedStyle on a detaching node returns "").
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector('.hm-iris .selena-logo-swap', { state: "attached", timeout: 15000 });
await np.waitForFunction(() => document.documentElement.dataset.motion === "reduce", null, { timeout: 5000 });
const swapOpacity = await np.locator('.hm-iris .selena-logo-swap').first()
  .evaluate((el) => getComputedStyle(el).opacity);
if (swapOpacity !== "0") { console.error(`FAIL: SelenaLogo swap not hidden under reduced motion (opacity=${swapOpacity})`); process.exit(1); }
console.log("PASS: reduced motion — SelenaLogo swap frozen (static rest)");
await np.goto(base + "/profile", { waitUntil: "domcontentloaded" });
await motionToggle.click();
dm = await np.evaluate(() => document.documentElement.dataset.motion);
if (dm === "reduce") { console.error("FAIL: reduced-motion toggle did not turn off"); process.exit(1); }
console.log("PASS: Profile — one h1, reduced-motion toggle flips data-motion");

// Selena Studio (RICOE v2, plan 2b Task 3): the one-per-page avatar builder. GET seeds
// the draft; selecting an option marks the draft dirty (no client-side compositing —
// the hero only ever shows the SAVED portrait or the default mascot); Save round-trips
// the edit to PUT /api/avatar (the persist state-invariant).
let savedAvatar = null;
let portraitState = { portrait_status: "none", portrait_url: null };
// Flips true only for the one dashboard nav below that exercises the greeting-card
// Selena swap; false everywhere else so the reduced-motion/onboarding sections
// further down still see the untouched (uncustomized) brand-mascot path.
let reportCustomized = false;
// 1×1 transparent PNG — stands in for the generated 3D Selena so the swap is deterministic.
const PORTRAIT_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const DEFAULT_CFG = { version: 2, bodyColor: "peach", irisColor: "blue", eyeShape: "round", lashes: "natural", mouth: "smile", blush: "peach", glasses: "none", topper: "none", accessory: "none", outfit: "none", background: "mist" };
// GET seeds the draft (echoes the saved config once saved) + reports portrait state;
// PUT captures the edit. Registered before the more specific portrait route below.
await navCtx.route("**/api/avatar", (r) => {
  if (r.request().method() === "PUT") {
    try { savedAvatar = JSON.parse(r.request().postData() || "{}"); } catch { savedAvatar = null; }
    return r.fulfill(JSON_OK({ config: savedAvatar }));
  }
  const cfg = savedAvatar ? { ...DEFAULT_CFG, ...savedAvatar } : DEFAULT_CFG;
  return r.fulfill(JSON_OK({ config: cfg, axes: {}, customized: reportCustomized, ...portraitState }));
});
// POST /api/avatar/portrait — the mock "renders instantly": mark the portrait ready so
// the next GET swaps the hero to the PNG. Registered last ⇒ wins for this exact path.
await navCtx.route("**/api/avatar/portrait", (r) => {
  portraitState = { portrait_status: "ready", portrait_url: PORTRAIT_PNG };
  return r.fulfill(JSON_OK({ portrait_status: "pending", portrait_url: null }));
});
await np.goto(base + "/studio", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".studio-hero img.selena-img", { timeout: 15000 });
const studioH1 = await np.locator("main h1").count();
if (studioH1 !== 1) { console.error(`FAIL: studio main h1 count = ${studioH1}`); process.exit(1); }
await np.locator('.studio-swatch:has-text("Aqua")').click();
await np.waitForSelector(".studio-chip", { timeout: 8000 });
console.log("PASS: Selena Studio — selecting an option marks unsaved changes (no client compositing)");

if ((await np.locator(".studio-tray-chip").count()) < 1) { console.error("FAIL: loadout tray did not dock the pending pick"); process.exit(1); }
console.log("PASS: Selena Studio — loadout tray docks pending picks as tile chips");

// shape steps render static option-tile art (not swatches). Jump to the last
// step (Backdrop) via its progress dot and assert the tile grid renders.
await np.locator(".studio-dots .studio-dot").last().click();
await np.waitForSelector(".studio-tiles .studio-tile", { timeout: 8000 });
console.log("PASS: Selena Studio — shape steps render option-tile art");

// Save round-trips the edited config to PUT /api/avatar; the celebration confirms success.
await np.locator(".studio-save").click();
await np.waitForFunction(() => document.querySelector(".studio-celebrate") != null, { timeout: 8000 });
if (!savedAvatar || savedAvatar.bodyColor !== "aqua") {
  console.error(`FAIL: Save did not PUT the edited config (savedAvatar=${JSON.stringify(savedAvatar)})`); process.exit(1);
}
console.log("PASS: Selena Studio — Save round-trips the edited config to PUT /api/avatar (bodyColor=aqua)");

// 3D portrait swap (part 3, Task 4): Save enqueues POST /api/avatar/portrait; once the
// mock reports it ready, useAvatar's poll swaps the hero from the default iris.png
// mascot to the transparent 3D PNG. Assert the hero now renders the generated portrait.
await np.waitForFunction(() => {
  const img = document.querySelector(".studio-hero img.selena-img");
  return img && img.getAttribute("src")?.startsWith("data:");
}, { timeout: 8000 });
const heroPortraitSrc = await np.locator(".studio-hero img.selena-img").getAttribute("src");
if (!heroPortraitSrc || !heroPortraitSrc.startsWith("data:")) {
  console.error(`FAIL: studio hero did not swap to the generated 3D portrait (src=${heroPortraitSrc})`); process.exit(1);
}
console.log("PASS: Selena Studio — Save renders + swaps the hero to the 3D portrait PNG");

await np.setViewportSize({ width: 390, height: 844 });
await np.waitForTimeout(250);
const studioOverflow = await np.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (studioOverflow > 2) { console.error(`FAIL: /studio horizontal overflow at 390px = ${studioOverflow}px`); process.exit(1); }
console.log("PASS: Selena Studio — no horizontal overflow at 390px");
await np.setViewportSize({ width: 1440, height: 900 });

// Selena everywhere — identity surfaces: the student's saved Selena replaces initials on the
// Profile avatar and the Atlas Rail profile chip (the tutor + home keep the BASE mascot per the
// ricoe A3 / home Iris locks). /api/avatar is mocked above, so a real config renders.
await np.goto(base + "/profile", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".aurora-profile-avatar-lg[data-selena] img.selena-img", { timeout: 12000 });
if ((await np.locator(".aurora-rail .aurora-avatar[data-selena] img.selena-img").count()) < 1) {
  console.error("FAIL: rail profile chip did not render the student's saved Selena"); process.exit(1);
}
console.log("PASS: Selena everywhere — Profile avatar + rail chip render the student's saved Selena");

// The greeting card is ALWAYS the default living mascot — even for a customized
// student (Custom-Selena lock amended 2026-07-10; user directive "greeting Selena
// default from now on"). The custom render lives on Studio + the leaderboard only,
// so a customized student must still see the brand SelenaLogo here (no .hm-selena
// custom render node).
reportCustomized = true;
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector('.hm-iriswrap [data-testid="selena-logo"]', { timeout: 15000 });
if ((await np.locator(".hm-selena img.hm-selena-img").count()) > 0) {
  console.error("FAIL: greeting shows a custom render for a customized student (should always be the default mascot)"); process.exit(1);
}
const greetRestSrc = (await np.locator('.hm-iriswrap [data-testid="selena-logo"] .selena-logo-rest').getAttribute("src")) ?? "";
if (!/\/brand\/iris\.png/.test(greetRestSrc)) { console.error(`FAIL: greeting mascot is not the default iris.png (src=${greetRestSrc})`); process.exit(1); }
console.log("PASS: Home greeting — always the DEFAULT living Selena, even when customized (lock amended 2026-07-10)");
reportCustomized = false;

// Leaderboard "The Climb" (ricoe D7 refresh): podium (top 3) + rivalry spotlight + XP
// tiers + glowing tiered rows. The GET mock honours ?role= and reflects the hide state
// so the filter + hide toggle are real behavioral verifies; prefs POST flips the flag.
let lbHidden = false;
const LB_ROWS = [
  { name: "Aisha R.",   role: "OT", xp: 12480, level: 24, streak_days: 31, avatar_config: { background: "galaxy" }, portrait_url: PORTRAIT_PNG, is_you: false },
  { name: "Wei Jie T.", role: "OA", xp: 10240, level: 22, streak_days: 18, avatar_config: { background: "mist" }, portrait_url: null, is_you: false },
  { name: "Priya N.",   role: "OT", xp: 7720,  level: 18, streak_days: 12, avatar_config: null, portrait_url: null, is_you: false },
  { name: "You",        role: "OA", xp: 7660,  level: 17, streak_days: 9,  avatar_config: { background: "peach" }, portrait_url: null, is_you: true },
  { name: "Marcus L.",  role: "OT", xp: 7635,  level: 17, streak_days: 6,  avatar_config: null, portrait_url: PORTRAIT_PNG, is_you: false },
  { name: "Siti N.",    role: "OA", xp: 6120,  level: 15, streak_days: 22, avatar_config: null, portrait_url: null, is_you: false },
  { name: "Daniel O.",  role: "OT", xp: 5540,  level: 14, streak_days: 0,  avatar_config: null, portrait_url: null, is_you: false },
];
await navCtx.route("**/api/leaderboard**", (r) => {
  if (r.request().method() === "POST") { // /prefs — flip the hide flag from the body
    try { const b = JSON.parse(r.request().postData() || "{}"); if (typeof b.hidden === "boolean") lbHidden = b.hidden; } catch { /* noop */ }
    return r.fulfill(JSON_OK({ ok: true }));
  }
  const role = new URL(r.request().url()).searchParams.get("role");
  let rows = LB_ROWS.filter((e) => !(lbHidden && e.is_you));
  if (role) rows = rows.filter((e) => e.role === role);
  const entries = rows.map((e, i) => ({ ...e, rank: i + 1 }));
  return r.fulfill(JSON_OK({ entries, you_hidden: lbHidden, display_name: null, roles: ["OA", "OT"] }));
});
await np.goto(base + "/leaderboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="podium-slot"]', { timeout: 15000 });
const lbH1 = await np.locator("main h1").count();
if (lbH1 !== 1) { console.error(`FAIL: leaderboard main h1 count = ${lbH1}`); process.exit(1); }
if ((await np.locator('[data-testid="podium-slot"]').count()) !== 3) { console.error("FAIL: leaderboard podium did not render 3 slots"); process.exit(1); }
if ((await np.locator('[data-testid="lb-row"]').count()) !== 4) { console.error("FAIL: expected 4 ranked rows below the podium"); process.exit(1); }
if ((await np.locator('[data-testid="leaderboard-root"] .selena-img[src^="data:"]').count()) < 1) {
  console.error("FAIL: leaderboard did not render any student's real rendered portrait"); process.exit(1);
}
const youRow = np.locator('[data-testid="lb-row"][data-you]');
if ((await youRow.count()) !== 1 || !(await youRow.innerText()).includes("You")) {
  console.error("FAIL: current user's row not highlighted on the leaderboard"); process.exit(1);
}
const spot = np.locator('[data-testid="rivalry-spotlight"]');
if ((await spot.count()) !== 1) { console.error("FAIL: rivalry spotlight missing"); process.exit(1); }
if (!(await spot.innerText()).toLowerCase().includes("overtake")) { console.error("FAIL: rivalry spotlight is not showing the overtake gap"); process.exit(1); }
if ((await np.locator('[data-testid="edit-selena"]').count()) < 1) { console.error("FAIL: Edit Selena entry missing on the leaderboard (ricoe §7)"); process.exit(1); }
console.log("PASS: Leaderboard 'The Climb' — podium, rivalry spotlight, tiered rows, you-row highlight, real portrait, Edit Selena");

// role filter narrows the WHOLE board (podium + rows) and drops the other role.
await np.locator('.lb-filter .lb-chip:has-text("OT")').click();
await np.waitForFunction(() => document.querySelectorAll('[data-testid="podium-slot"], [data-testid="lb-row"]').length === 4, { timeout: 8000 });
console.log("PASS: Leaderboard — role filter narrows the board");
await np.locator('.lb-filter .lb-chip:has-text("All")').click();
await np.waitForFunction(() => document.querySelectorAll('[data-testid="podium-slot"], [data-testid="lb-row"]').length === 7, { timeout: 8000 });

// hide toggle (D7 opt-out): flipping it off removes the viewer's own row from the board.
await np.locator('[data-testid="lb-hide-switch"]').click();
await np.waitForFunction(() => document.querySelectorAll('[data-testid="lb-row"][data-you]').length === 0, { timeout: 8000 });
console.log("PASS: Leaderboard — hide toggle removes you from the board");

await np.setViewportSize({ width: 390, height: 844 });
await np.waitForTimeout(250);
const lbOverflow = await np.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (lbOverflow > 2) { console.error(`FAIL: /leaderboard horizontal overflow at 390px = ${lbOverflow}px`); process.exit(1); }
console.log("PASS: Leaderboard — no horizontal overflow at 390px");
await np.setViewportSize({ width: 1440, height: 900 });

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

// first-run Selena onboarding gate (ricoe §7): a student who has NEVER customized their
// Selena (GET /api/avatar → customized:false) is routed once into welcome-mode Studio.
// Show-once is the historically-fragile invariant, so we also cover the repeat case: after
// a skip (local flag) AND once customized, /dashboard must NOT re-gate.
const onbUser = { full_name: "New Student", email: "new@snec.com.sg", student_id: "S777", role: "student", student_role: "OA", must_change: false };
const onbCtx = await b.newContext({ viewport: { width: 1280, height: 860 } });
await onbCtx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  sessionStorage.setItem("eyebot_checkin_session", "1");
  localStorage.setItem("eyebot_tour_seen", "true");
  localStorage.setItem("eyebot_rail_pinned", "1");
}, onbUser);
await onbCtx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
let onbCustomized = false;
await onbCtx.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
await onbCtx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(onbUser)));
await onbCtx.route("**/api/checkin/status", (r) => r.fulfill(JSON_OK({ streak: 0 })));
await onbCtx.route("**/api/progress", (r) => r.fulfill(JSON_OK({ xp: 0, xp_today: 0, daily_goal: 100, hearts: 3, level: 1, streak: 0, streak_detail: { current: 0, best: 0, week: [] }, weak_topics: [], topic_performance: [], sessions: [] })));
await onbCtx.route("**/api/avatar", (r) => r.fulfill(JSON_OK({ config: DEFAULT_CFG, axes: {}, customized: onbCustomized })));
const onbPage = await onbCtx.newPage();

// A) never-customized → routed to welcome-mode Studio.
await onbPage.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await onbPage.waitForURL(/\/studio\?welcome=1/, { timeout: 15000 });
await onbPage.waitForSelector(".studio-skip", { timeout: 10000 });
console.log("PASS: onboarding — never-customized student is routed to /studio?welcome=1 (welcome mode)");

// B) show-once (repeat case): after a skip sets the local flag, /dashboard is NOT re-gated.
await onbPage.evaluate(() => localStorage.setItem("eyebot_selena_onboarded", "1"));
await onbPage.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await onbPage.waitForSelector('[data-testid="greeting"]', { timeout: 15000 });
if (/\/studio/.test(onbPage.url())) { console.error("FAIL: onboarding re-nagged a student who skipped (show-once broken)"); process.exit(1); }
console.log("PASS: onboarding — a student who skipped is not re-gated (show-once)");

// C) a customized student is never gated (even with no local flag).
onbCustomized = true;
await onbPage.evaluate(() => localStorage.removeItem("eyebot_selena_onboarded"));
await onbPage.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await onbPage.waitForSelector('[data-testid="greeting"]', { timeout: 15000 });
if (/\/studio/.test(onbPage.url())) { console.error("FAIL: a customized student was wrongly gated into onboarding"); process.exit(1); }
// (The home greeting card no longer carries an Edit-Selena entry — stripped 2026-07-10;
//  it now lives on the leaderboard + Profile only. The leaderboard entry is asserted above.)
console.log("PASS: onboarding — customized student never gated");

// self-heal (once-per-session state invariant, /ship-check): a customized student whose
// portrait is still "none" (pre-v2 salted look) fires ONE cache-gated render request when
// the greeting card mounts — and must NOT re-fire on a second mount in the same browser
// session (the sessionStorage gate). Isolated context = fresh sessionStorage so the counter
// + gate are clean; POST /api/avatar/portrait is stubbed keyless (no live render). Covers
// useSelfHealPortrait (useAvatar.ts) directly, not just the downstream render swap.
const healUser = { full_name: "Heal Student", email: "heal@snec.com.sg", student_id: "S888", role: "student", student_role: "OA", must_change: false };
const healCtx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await healCtx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  sessionStorage.setItem("eyebot_checkin_session", "1");
  localStorage.setItem("eyebot_tour_seen", "true");
  localStorage.setItem("eyebot_rail_pinned", "1");
  localStorage.setItem("eyebot_selena_onboarded", "1"); // already customized ⇒ don't gate into welcome Studio
}, healUser);
await healCtx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
let healRenderCount = 0;
await healCtx.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
await healCtx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(healUser)));
await healCtx.route("**/api/checkin/status", (r) => r.fulfill(JSON_OK({ streak: 0 })));
await healCtx.route("**/api/progress", (r) => r.fulfill(JSON_OK({ xp: 0, xp_today: 0, daily_goal: 100, hearts: 3, level: 1, streak: 0, streak_detail: { current: 0, best: 0, week: [] }, weak_topics: [], topic_performance: [], sessions: [] })));
// customized + portrait "none" ⇒ the greeting card shows the brand SelenaLogo (no ready
// portrait) while useSelfHealPortrait fires the one-shot render request underneath.
await healCtx.route("**/api/avatar", (r) => r.fulfill(JSON_OK({ config: DEFAULT_CFG, axes: {}, customized: true, portrait_status: "none", portrait_url: null })));
// POST /api/avatar/portrait — count invocations; return a harmless keyless stub (MOCK-safe).
await healCtx.route("**/api/avatar/portrait", (r) => {
  healRenderCount += 1;
  return r.fulfill(JSON_OK({ portrait_status: "pending", portrait_url: null }));
});
const hp = await healCtx.newPage();
await hp.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await hp.waitForSelector('[data-testid="greeting"]', { timeout: 15000 });
// first mount: exactly one self-heal render request fires (poll the Node-side counter).
for (let i = 0; i < 60 && healRenderCount < 1; i++) await hp.waitForTimeout(100);
if (healRenderCount !== 1) { console.error(`FAIL: self-heal fired ${healRenderCount} render requests on first mount, expected 1`); process.exit(1); }
console.log("PASS: self-heal — customized+portrait-none student fires exactly one render on mount");
// second mount in the SAME session (full nav away + back ⇒ React remounts, sessionStorage
// persists): the gate must suppress a second request.
await hp.goto(base + "/leaderboard", { waitUntil: "domcontentloaded" });
await hp.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await hp.waitForSelector('[data-testid="greeting"]', { timeout: 15000 });
await hp.waitForTimeout(800); // let any (wrongly) re-fired request land before asserting
if (healRenderCount !== 1) { console.error(`FAIL: self-heal re-fired on a second mount in the same session (count=${healRenderCount}); once-per-session gate broken`); process.exit(1); }
console.log("PASS: self-heal — second mount in the same session does NOT re-fire (once-per-session gate holds)");
await healCtx.close();

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
// through the pre-deck intro beat (ricoe B5) into the deck…
await stp.locator('[data-testid="flash-intro-begin"]').click();
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

// ── RICOE v2 Foundation 1: semantic token contract ────────────────
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
const rv2Tokens = await np.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return {
    "flash-canvas": cs.getPropertyValue("--flash-canvas").trim(),
    "flash-card": cs.getPropertyValue("--flash-card").trim(),
    "flash-ink": cs.getPropertyValue("--flash-ink").trim(),
    "dur-base": cs.getPropertyValue("--dur-base").trim(),
    "ease-out": cs.getPropertyValue("--ease-out").trim(),
  };
});
for (const [name, val] of Object.entries(rv2Tokens)) {
  if (!val) { console.error(`FAIL: token --${name} is not defined`); process.exit(1); }
}
console.log("PASS: RICOE v2 semantic tokens resolve");

// ── RICOE v2 Foundation 1: animated Gemini-accent primitive ───────
const accent = await np.evaluate(() => {
  const el = document.createElement("div");
  el.className = "aurora-gemini-accent";
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const out = { bg: cs.backgroundImage, size: cs.backgroundSize, anim: cs.animationName };
  el.remove();
  return out;
});
if (!/gradient/.test(accent.bg)) { console.error(`FAIL: gemini accent has no gradient (${accent.bg})`); process.exit(1); }
if (accent.anim !== "aurora-gemini-slide") { console.error(`FAIL: gemini accent not animated (${accent.anim})`); process.exit(1); }
console.log("PASS: animated Gemini accent primitive renders + animates");

await np.evaluate(() => document.documentElement.setAttribute("data-motion", "reduce"));
const frozen = await np.evaluate(() => {
  const el = document.createElement("div");
  el.className = "aurora-gemini-accent";
  document.body.appendChild(el);
  const name = getComputedStyle(el).animationName;
  el.remove();
  return name;
});
if (frozen !== "none") { console.error(`FAIL: gemini accent not frozen under reduced motion (${frozen})`); process.exit(1); }
console.log("PASS: Gemini accent freezes under reduced motion");
await np.evaluate(() => document.documentElement.removeAttribute("data-motion"));

await b.close();
