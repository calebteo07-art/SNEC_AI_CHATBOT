import { chromium } from "playwright";
import { monthCells, MASTERY } from "./_mocks.mjs";
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
  localStorage.setItem("eyebot_checkin_date", new Date().toLocaleDateString("en-CA"));
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
  coins_earned: 1800,   // 5 of the 20 Lumens tiers collected; "Keen Eye" (2200) is next
  streak_detail: {
    current: 4, best: 9, freezes: 1, done_today: false,
    tier: "First Light", next_tier: "Clear View", to_next: 1,
    week: [
      { day: "Mon", date: "2026-07-20", state: "done" },
      { day: "Tue", date: "2026-07-21", state: "done" },
      { day: "Wed", date: "2026-07-22", state: "today" },
      { day: "Thu", date: "2026-07-23", state: "upcoming" },
      { day: "Fri", date: "2026-07-24", state: "upcoming" },
      { day: "Sat", date: "2026-07-25", state: "rest" },
      { day: "Sun", date: "2026-07-26", state: "rest" },
    ],
    month: monthCells(2026, 7, "2026-07-22", ["2026-07-20", "2026-07-21"]),
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
// set_key/set_label ride along on every case (the backend buckets each topic into a role-aware
// set) — they drive both the card chip and the topic chip-row. tonometry_iop has 2 cases (C001,
// C004); the others 1 each.
await navCtx.route("**/api/cases", (r) => r.fulfill(JSON_OK({ cases: [
  { case_id: "C001", title: "Sudden painful red eye", difficulty: "intermediate", topic: "Glaucoma", estimated_minutes: 12, set_key: "tonometry_iop", set_label: "Intraocular Pressure", patient: { name: "Mdm Tan", age: 64, presenting_complaint: "Acute pain with halos" } },
  { case_id: "C002", title: "Gradual vision loss", difficulty: "beginner", topic: "Cataract", estimated_minutes: 10, set_key: "perioperative", set_label: "Pre & Post-Operative Care", patient: { name: "Mr Lim", age: 71, presenting_complaint: "Blurred near vision" } },
  { case_id: "C003", title: "Flashes and floaters", difficulty: "advanced", topic: "Retina", estimated_minutes: 14, set_key: "triage_referral", set_label: "Triage & Referral", patient: { name: "Ms Wong", age: 55, presenting_complaint: "New floaters since yesterday" } },
  // ricoe C2: a LOCKED case is still returned so it shows (as a locked card) attached to its eye part.
  { case_id: "C004", title: "Advanced disc assessment", difficulty: "advanced", topic: "Glaucoma optic disc", estimated_minutes: 15, locked: true, set_key: "tonometry_iop", set_label: "Intraocular Pressure", patient: { name: "Mr Ng", age: 68, presenting_complaint: "Progressive field loss" } },
] })));
// Topic-sets for the chip-row picker: canonical order + counts. eye_drops (total 0) must be
// hidden; triage_referral (completed==total) must show the done tick.
await navCtx.route("**/api/cases/topics", (r) => r.fulfill(JSON_OK({ topics: [
  { set_key: "tonometry_iop", label: "Intraocular Pressure", total: 2, completed: 0 },
  { set_key: "perioperative", label: "Pre & Post-Operative Care", total: 1, completed: 0 },
  { set_key: "triage_referral", label: "Triage & Referral", total: 1, completed: 1 },
  { set_key: "eye_drops", label: "Eye Drop Instillation", total: 0, completed: 0 },
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
// The branded Eyecon splash shows while the app-shell chunk loads on first paint. It is the
// `loading:` fallback of a dynamic({ssr:false}) import, i.e. a WINDOW, not a state — racing it
// flaked both ways: "never appeared" when a warm server delivered the chunk before first
// paint, and "has no EyeBot mark" when the shell mounted and tore the splash down between the
// waitFor and the assert. Hold the window open by delaying the chunk fetches for this one
// navigation, so the boundary is deterministic; unroute immediately after.
const chunkDelay = async (r) => {
  await new Promise((s) => setTimeout(s, 600));
  // a chunk still sleeping when we unroute below is already handled by then — continuing it
  // again throws "Route is already handled!" as an unhandled rejection and kills the run.
  try { await r.continue(); } catch { /* unrouted mid-flight */ }
};
await np.route("**/_next/static/chunks/**", chunkDelay);
await np.goto(base + "/homepage", { waitUntil: "commit" });
const splash = np.locator('[data-testid="brand-splash"]');
try {
  await splash.waitFor({ state: "attached", timeout: 8000 });
  const role = await splash.getAttribute("role");
  if (role !== "status") { console.error(`FAIL: BrandSplash missing role=status (got ${role})`); process.exit(1); }
  if ((await splash.locator('[data-testid="aurora-logo"]').count()) < 1) { console.error("FAIL: BrandSplash has no EyeBot mark"); process.exit(1); }
  console.log("PASS: BrandSplash — branded loading boundary with the mono EyeBot mark");
} catch {
  console.error("FAIL: BrandSplash loading boundary never appeared on first paint");
  process.exit(1);
}
await np.unroute("**/_next/static/chunks/**", chunkDelay);
await np.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
// wait for the rail to actually populate (first dev compile can be slow)
await np.waitForSelector('.aurora-navitem:has-text("Homepage")', { timeout: 15000 });
if ((await np.locator('[data-testid="aurora-logo"]').count()) < 1) { console.error("FAIL: EyeBot logo not rendered in the rail"); process.exit(1); }
console.log("PASS: EyeBot mono logo renders in the Atlas Rail");
for (const label of ["Homepage", "Tutor", "Virtual Patients", "Flashcards"]) {
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
await np.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="home-root"]', { timeout: 15000 });
const h1count = await np.locator("main h1").count();
if (h1count !== 1) { console.error(`FAIL: dashboard main h1 count = ${h1count}`); process.exit(1); }
if ((await np.locator('[data-testid="streak-tile"]').count()) !== 1) { console.error("FAIL: streak tile missing"); process.exit(1); }
if ((await np.locator('[data-testid="milestone-ladder"]').count()) !== 0) { console.error("FAIL: the streak vault was removed 2026-07-29 but still renders"); process.exit(1); }
if ((await np.locator('[data-testid="lumen-ladder"]').count()) !== 1) { console.error("FAIL: Lumens vault ladder missing"); process.exit(1); }
if ((await np.locator('[data-testid="feature-card"]').count()) !== 3) { console.error("FAIL: expected 3 feature cards"); process.exit(1); }
const greetText = (await np.locator('[data-testid="greeting"]').innerText()).trim();
if (!greetText) { console.error("FAIL: greeting h1 is empty"); process.exit(1); }
console.log("PASS: warm home (greeting h1, streak tile, ONE Lumens vault, 3 feature cards)");

// The Lumens vault is the app's only badge collection: a horizontal shelf of 20 generated
// medallions. With coins_earned=1800, five tiers are collected, "Keen Eye" (2200) is next
// and the other fourteen are locked. Verifies the state mapping AND that the art is served.
const ladder = '[data-testid="lumen-ladder"]';
if ((await np.locator(`${ladder} .hm-badge`).count()) !== 20) { console.error("FAIL: expected 20 Lumens badges"); process.exit(1); }
if ((await np.locator(`${ladder} .hm-badge-art`).count()) !== 20) { console.error("FAIL: Lumens badges missing medallion art"); process.exit(1); }
const bCollected = await np.locator(`${ladder} .hm-badge[data-state="collected"]`).count();
const bNext = await np.locator(`${ladder} .hm-badge[data-state="next"]`).count();
const bLocked = await np.locator(`${ladder} .hm-badge[data-state="locked"]`).count();
if (bCollected !== 5 || bNext !== 1 || bLocked !== 14) { console.error(`FAIL: badge states (collected=${bCollected} next=${bNext} locked=${bLocked})`); process.exit(1); }
const badgeServed = await np.evaluate(async () => (await fetch("/brand/lumen-badges/first-blink.jpg")).ok);
if (!badgeServed) { console.error("FAIL: badge art /brand/lumen-badges/first-blink.jpg not served"); process.exit(1); }

// The frame shows EXACTLY five at a time (20 medallions = 4 pages) and opens on the page
// holding the student's next badge. With coins_earned=1800 that badge is #6 (Keen Eye),
// so the frame must open on page 2 — not parked at rung 1.
const framed = () => np.evaluate(() => {
  const el = document.querySelector('[data-testid="lumen-ladder"] .hm-badges');
  if (!el) return null;
  const kids = [...el.children];
  const stride = kids[5].offsetLeft - kids[0].offsetLeft;
  const left = el.scrollLeft, right = left + el.clientWidth;
  // a badge counts as "on show" only if it sits wholly inside the frame
  const shown = kids.filter((k) => k.offsetLeft >= left - 2 && k.offsetLeft + k.offsetWidth <= right + 2);
  return { shown: shown.length, first: shown[0]?.querySelector(".hm-badge-name")?.textContent?.trim(),
    scrollable: el.scrollWidth > el.clientWidth + 4, page: Math.round(left / stride),
    label: document.querySelector('[data-testid="vault-page"]')?.textContent?.trim() };
});
let fr = await framed();
if (!fr?.scrollable) { console.error("FAIL: the vault frame does not overflow — it cannot page"); process.exit(1); }
if (fr.shown !== 5) { console.error(`FAIL: expected exactly 5 badges framed, got ${fr.shown}`); process.exit(1); }
if (fr.page !== 1) { console.error(`FAIL: frame should open on the page holding 'next' (page 2 of 4), got page ${fr.page + 1}`); process.exit(1); }
if (fr.label !== "2 / 4") { console.error(`FAIL: pager readout = ${fr.label}, expected "2 / 4"`); process.exit(1); }

// ‹ › step exactly one page, and clamp at both ends rather than running off.
await np.locator('[data-testid="vault-prev"]').click();
await np.waitForTimeout(650);
fr = await framed();
if (fr.page !== 0 || fr.first !== "First Blink") { console.error(`FAIL: ‹ did not step back to page 1 (page=${fr.page + 1} first=${fr.first})`); process.exit(1); }
if (!(await np.locator('[data-testid="vault-prev"]').isDisabled())) { console.error("FAIL: ‹ must be disabled on the first page"); process.exit(1); }
for (let i = 0; i < 3; i++) { await np.locator('[data-testid="vault-next"]').click(); await np.waitForTimeout(650); }
fr = await framed();
if (fr.page !== 3 || fr.shown !== 5) { console.error(`FAIL: › did not reach the last page (page=${fr.page + 1} shown=${fr.shown})`); process.exit(1); }
if (!(await np.locator('[data-testid="vault-next"]').isDisabled())) { console.error("FAIL: › must be disabled on the last page"); process.exit(1); }
console.log("PASS: Lumens vault — 20 medallions, 5 framed per page, ‹ › page and clamp, opens on the 'next' page, art served");

// Streak card: the daily-goal % ring is GONE and the whole month renders. July 2026 starts
// on a Wednesday, so the grid must pad exactly 2 leading cells before the 31 day cells.
if ((await np.locator('.hm-streak .hm-goalring').count()) !== 0) { console.error("FAIL: the daily-goal % ring was removed 2026-07-29 but still renders"); process.exit(1); }
if ((await np.locator('.hm-streak .hm-week').count()) !== 0) { console.error("FAIL: the week strip was replaced by the month calendar but still renders"); process.exit(1); }
const cal = await np.evaluate(() => {
  const el = document.querySelector('[data-testid="month-calendar"]');
  if (!el) return null;
  return { pads: el.querySelectorAll(".hm-calpad").length, days: el.querySelectorAll(".hm-calday").length,
    month: el.querySelector(".hm-calmonth")?.textContent?.trim(),
    today: el.querySelectorAll('.hm-calday[data-state="today"]').length,
    done: el.querySelectorAll('.hm-calday[data-state="done"]').length };
});
if (!cal) { console.error("FAIL: month calendar missing from the streak card"); process.exit(1); }
if (cal.days !== 31) { console.error(`FAIL: expected 31 July cells, got ${cal.days}`); process.exit(1); }
if (cal.pads !== 2) { console.error(`FAIL: 1 July 2026 is a Wednesday — expected 2 leading blanks, got ${cal.pads}`); process.exit(1); }
if (cal.month !== "July 2026") { console.error(`FAIL: month label = ${cal.month}`); process.exit(1); }
if (cal.today !== 1 || cal.done !== 2) { console.error(`FAIL: calendar states (today=${cal.today} done=${cal.done})`); process.exit(1); }
console.log("PASS: streak card — no goal ring, full month calendar (31 cells, 2 leading blanks, correct states)");

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
await np.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="home-root"]', { timeout: 15000 });

// mobile: no horizontal overflow at 390x844.
await np.setViewportSize({ width: 390, height: 844 });
await np.waitForTimeout(400);
const overflow = await np.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 2) { console.error(`FAIL: horizontal overflow at 390px = ${overflow}px`); process.exit(1); }
console.log("PASS: dashboard has no horizontal overflow at 390px");

// Animated Eyecon logo greets on Home (logo→raster brief): the rest frame IS the
// homepage iris.png, running the calm "hello" motion.
const homeLogo = np.locator('[data-testid="eyecon-logo"]').first();
if ((await homeLogo.count()) < 1) { console.error("FAIL: EyeconLogo missing on the Home greeting"); process.exit(1); }
const homeMotion = await homeLogo.getAttribute("data-motion");
if (homeMotion !== "hello") { console.error(`FAIL: Home EyeconLogo motion is '${homeMotion}', expected 'hello'`); process.exit(1); }
const homeRestSrc = (await homeLogo.locator(".eyecon-logo-rest").getAttribute("src")) ?? "";
if (!/\/brand\/iris\.png/.test(homeRestSrc)) { console.error(`FAIL: Home EyeconLogo rest frame is not iris.png (src=${homeRestSrc})`); process.exit(1); }
console.log("PASS: Home — animated EyeconLogo (hello) on the iris.png rest frame");

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

// topic filter (spec 2026-07-19): a chip-row filters the SAME list by topic-set and is
// MUTUALLY EXCLUSIVE with the eye-region lens (one active lens at a time). Zero-count sets are
// hidden; a fully-completed set shows a done tick.
await np.goto(base + "/cases", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="topic-filter"] .aurora-topic-chip', { timeout: 15000 });
// "All patients" + 3 non-empty sets = 4 chips (the total:0 eye_drops set is hidden).
const chipN = await np.locator('[data-testid="topic-filter"] .aurora-topic-chip').count();
if (chipN !== 4) { console.error(`FAIL: topic chip row = ${chipN} chips (want 4: All + 3 non-empty sets; empty set hidden)`); process.exit(1); }
if ((await np.locator('.aurora-topic-chip[data-done]').count()) !== 1) { console.error("FAIL: the fully-completed topic set should show a done state"); process.exit(1); }
const allN = await np.locator('[data-testid="case-list"] .aurora-case').count();
// picking the 2-case IOP set narrows the list to those 2.
await np.locator('.aurora-topic-chip:has-text("Intraocular Pressure")').click();
await np.waitForTimeout(300);
const topicN = await np.locator('[data-testid="case-list"] .aurora-case').count();
if (topicN !== 2) { console.error(`FAIL: topic filter should show the 2 IOP cases, got ${topicN}`); process.exit(1); }
console.log("PASS: topic chip-row filters the case list by set (empty set hidden, completed set ticked)");
// mutual exclusion: tapping an eye-region pin clears the active topic (chip row → "All patients").
await np.locator('.aurora-pin:has-text("Optic disc")').click();
await np.waitForTimeout(300);
const activeChipTxt = (await np.locator('.aurora-topic-chip[data-active="true"]').first().innerText()).trim();
if (!/all patients/i.test(activeChipTxt)) { console.error(`FAIL: picking a region did not reset the topic chip-row (active chip='${activeChipTxt}')`); process.exit(1); }
const regionN = await np.locator('[data-testid="case-list"] .aurora-case').count();
if (!(regionN >= 1 && regionN < allN)) { console.error(`FAIL: eye-region lens not applied after topic reset (got ${regionN}/${allN})`); process.exit(1); }
console.log("PASS: topic + eye-region are mutually exclusive (one active lens)");
// "All patients" clears the lens and restores the whole library.
await np.locator('.aurora-topic-chip:has-text("All patients")').click();
await np.waitForTimeout(300);
const restoredN = await np.locator('[data-testid="case-list"] .aurora-case').count();
if (restoredN !== allN) { console.error(`FAIL: 'All patients' did not restore the full list (${restoredN}/${allN})`); process.exit(1); }
console.log("PASS: 'All patients' clears the lens and restores the full patient list");

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
const ldEb = await np.locator('[data-testid="tutor-landing"] .aurora-cobrand-mark-wrap [data-testid="aurora-logo"]').count();
const ldSnec = await np.locator('[data-testid="tutor-landing"] .aurora-snec').count();
if (ldEb < 1) { console.error("FAIL: EyeBot mark missing on the Tutor landing (lone SNEC is not a lockup)"); process.exit(1); }
if (ldSnec < 1) { console.error("FAIL: SNEC mark missing on the Tutor landing"); process.exit(1); }
// Dancing Iris greets above the hello (Branding lock) — a Veo <video> anchored to the
// homepage iris.png as its poster/fallback (no clip needed keyless: the poster renders).
const iris = np.locator('[data-testid="tutor-landing"] .tl-iris');
if ((await iris.count()) < 1) { console.error("FAIL: Iris mascot missing on the Tutor landing"); process.exit(1); }
const irisPoster = (await iris.getAttribute("poster")) ?? (await iris.getAttribute("src")) ?? "";
if (!/\/brand\/iris\.png/.test(irisPoster)) { console.error(`FAIL: Tutor mascot not anchored to iris.png (poster=${irisPoster})`); process.exit(1); }
// Tutor reading sans = Manrope, scoped to .aurora-chat (mono accent labels stay JetBrains).
const tlFont = await np.locator('[data-testid="tutor-landing"] .tl-hello')
  .evaluate((el) => getComputedStyle(el).fontFamily).catch(() => "");
if (!/manrope/i.test(tlFont)) { console.error(`FAIL: Tutor hello not Manrope (fontFamily=${tlFont})`); process.exit(1); }
// Recent sessions are real localStorage conversations now — with none seeded (harness),
// the landing shows NOTHING there (no hardcoded starter pills, no empty-state cards).
if ((await np.locator('[data-testid="tutor-landing"] .tl-starter').count()) !== 0) {
  console.error("FAIL: tutor landing still renders hardcoded STARTERS"); process.exit(1);
}
const chatH1 = await np.locator("main h1").count();
if (chatH1 !== 1) { console.error(`FAIL: chat main h1 count = ${chatH1}`); process.exit(1); }
console.log("PASS: Tutor greeting landing — cosmic wash, prompt, full EyeBot + SNEC lockup, dancing Iris, one h1");

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
// avatar is the default Eyecon mascot (ricoe A3).
if ((await np.locator('.aurora-msg.is-eyebot .aurora-msg-avatar img.aurora-msg-mascot').count()) < 1) {
  console.error("FAIL: EyeBot reply avatar not using the default Eyecon mascot"); process.exit(1);
}
console.log("PASS: Tutor landing→thread transition + SSE stream + Eyecon mascot reply avatar");

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
// topics: the REAL OA/PSA syllabus at production scale — 12 Foundations + 14 Clinical = 26
// one-per-topic decks (difficulty collapsed; set_key == topic_key), + Mixed = 27 cards. Mocking
// the true size (not a toy 8) is deliberate: the coverflow must stay readable with one dominant
// front card at 26+ topics — a small mock hid the prod "crushed slab" regression twice.
await navCtx.route("**/api/flashcards/topics", (r) => r.fulfill(JSON_OK({ sets: [
  ["anatomy_physiology", "Ocular Anatomy & Physiology"], ["microbiology_infection", "Microbiology & Infection Control"],
  ["pharmacology", "Ocular Pharmacology"], ["ocular_emergencies", "Ocular Emergencies"],
  ["professional_ethics", "Professional Practice & Ethics"], ["disorders_eyelid_lacrimal_orbit", "Eyelid, Lacrimal & Orbit Disorders"],
  ["disorders_cornea_conjunctiva", "Cornea, Sclera & Conjunctiva Disorders"], ["disorders_lens_cataract", "Lens & Cataract Disorders"],
  ["disorders_uvea_retina", "Uvea & Retina Disorders"], ["glaucoma", "Glaucoma"],
  ["neuro_strabismus", "Neuro-ophthalmology & Strabismus"], ["systemic_disease", "Systemic Disease & the Eye"],
  ["red_eye", "Red Eye Differential"], ["triage", "Triage Categories"],
  ["history_taking", "History Taking"], ["distance_va", "Distance Visual Acuity"],
  ["near_vision", "Near Vision"], ["pinhole", "Pinhole Testing"],
  ["iop_nct", "IOP & Non-Contact Tonometry"], ["eye_drops", "Eye Drop Instillation"],
  ["pupil_dilation", "Pupil Dilation"], ["colour_vision", "Colour Vision (Ishihara)"],
  ["amsler_macula", "Amsler & Macula"], ["fall_risk", "Fall Risk"],
  ["perioperative", "Pre & Post-Operative Care"], ["abbreviations", "Ophthalmic Abbreviations"],
// decks_completed cycles 0..5 across the topics so the fan caption renders all three
// ladder states (untouched / part-way / all 5 cleared), not just one.
].map(([topic_key, label], i) => ({ set_key: topic_key, topic_key, label, difficulty: "mixed",
  total: 50, decks_completed: i % 6, deck_count: 5 })) })));

await np.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="flash-setup"]', { timeout: 15000 });
const fcH1 = await np.locator("main h1").count();
if (fcH1 !== 1) { console.error(`FAIL: flashcards main h1 count = ${fcH1}`); process.exit(1); }
// immersive: the rail falls away on /flashcards (like the Tutor); exit affordance present.
if ((await np.locator('[data-testid="flash-exit"]').count()) < 1) { console.error("FAIL: flashcards exit affordance missing"); process.exit(1); }
// …and "falls away" must mean UNREACHABLE, not merely un-reflowed. This context seeds
// eyebot_rail_pinned=1 — a real persisted student choice, one click on the edge handle,
// and the rail's own nav is how you get to /flashcards in the first place. A pinned rail
// parks at x=0, 248px wide, z-60, opaque; the rail-less canvas draws its own exit control
// at left:18px — underneath it. `--rail-w → 0` makes the canvas full-bleed but does NOT
// unpark the rail, so presence-only checks (count/innerText pass on covered elements)
// never caught this; the click 70 lines below just timed out for 30s instead.
await np.waitForTimeout(700); // the rail's 0.46s glide must settle before hit-testing
const exitHit = await np.evaluate(() => {
  const exit = document.querySelector('[data-testid="flash-exit"]');
  const r = exit.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  const name = (el) => !el ? "nothing" : el.tagName.toLowerCase() + (el.closest(".aurora-rail") ? " (inside .aurora-rail)" : "");
  const rail = document.querySelector(".aurora-rail")?.getBoundingClientRect();
  return { hit: exit === top || exit.contains(top), by: name(top), railX: rail ? Math.round(rail.x) : null, railW: rail ? Math.round(rail.width) : null };
});
if (!exitHit.hit) {
  console.error(`FAIL: flashcards exit control is COVERED — topmost element at its centre is ${exitHit.by}; the rail sits at x=${exitHit.railX} w=${exitHit.railW}. /flashcards is a rail-less surface (docs/design-locks.md): a pinned rail must not park over its canvas.`);
  process.exit(1);
}
console.log("PASS: flashcards — rail-less: a pinned rail never covers the exit control");

// single-step selection: no difficulty/length step — /flashcards lands straight on
// the auto-rotating topic coverflow (Mixed + the 26 mocked topics) with arrows. One
// click on any card starts that topic's deck (10 cards, all tiers mixed).
await np.waitForSelector('[data-testid="flash-fan"]', { timeout: 15000 });
if ((await np.locator('[data-testid="flash-continue"]').count()) > 0) {
  console.error("FAIL: the difficulty/length step still exists — selection should be topic-only"); process.exit(1);
}
// Every role topic is in the pool (nothing excluded): 26 OA/PSA topics + Mixed = 27 cards, all
// present in the DOM (the coverflow windows which are VISIBLE, but never drops any from the pool).
const fanCount = await np.locator('[data-testid="flash-pick"]').count();
if (fanCount !== 27) { console.error(`FAIL: topic coverflow card count = ${fanCount} (want 27: Mixed + 26 topics)`); process.exit(1); }
if ((await np.locator('[data-testid="flash-prev"]').count()) < 1) { console.error("FAIL: topic fan pagination arrows missing"); process.exit(1); }
console.log("PASS: Flashcards — single-step topic fan (Mixed + topics, no difficulty step)");
// Arcade redesign (2026-07-12): topic cards carry NO race numbers, the pagination DOTS
// are gone (arrows only), and the selection is de-Mario'd (no "Grand Prix").
if ((await np.locator('.fan-card-num').count()) !== 0) { console.error("FAIL: topic cards must not show race numbers"); process.exit(1); }
if ((await np.locator('.fan-dot').count()) !== 0) { console.error("FAIL: topic selection must not show pagination dots"); process.exit(1); }
const setupTitle = (await np.locator('.flash-setup-title').innerText()).toLowerCase();
if (/grand prix|mario/.test(setupTitle)) { console.error(`FAIL: selection still uses racing/Mario copy (got '${setupTitle}')`); process.exit(1); }
console.log("PASS: flashcards — selection de-Mario'd (no numbers, no dots, no 'Grand Prix')");
// The 5-deck ladder STICKER (2026-07-29): how far up its own ladder the student has climbed
// rides on a die-cut sticker peeled onto each topic card's TOP-RIGHT corner — it used to be
// the caption line, and before that a "Foundations"/"Skills" pool label that told a student
// nothing they could act on. The mock cycles decks_completed 0..5, so all three sticker
// states must appear. The count must be stated ONCE: never in the caption as well.
const stickers = await np.evaluate(() => [...document.querySelectorAll('[data-testid="flash-pick"]')]
  .map((card) => {
    const s = card.querySelector('[data-testid="fan-sticker"]');
    const media = card.querySelector(".fan-card-media");
    if (!s || !media) return null;
    const r = s.getBoundingClientRect(), m = media.getBoundingClientRect();
    return { text: s.querySelector(".fan-sticker-num")?.textContent?.trim(),
      cap: s.querySelector(".fan-sticker-cap")?.textContent?.trim(),
      state: s.getAttribute("data-state"),
      // a sticker sits on the card's TOP-RIGHT corner and OVERHANGS it. Only meaningful
      // on the FRONT card: the neighbours are banked 54° away, so their projected rects
      // compress and would make this geometry a flaky, meaningless comparison.
      w: m.width,
      topRight: r.top < m.top + m.height * 0.25 && r.right > m.left + m.width * 0.75,
      overhangs: r.right > m.right + 2 && r.top < m.top - 2 };
  }).filter(Boolean));
const fanSubs = (await np.locator('[data-testid="flash-pick"] .fan-card-sub').allInnerTexts())
  .join(" | ").toLowerCase();
if (/foundations|skills/.test(fanSubs)) {
  console.error(`FAIL: topic cards still carry the Foundations/Skills pool label (got '${fanSubs}')`); process.exit(1);
}
if (/\d\s*\/\s*5|decks/.test(fanSubs)) {
  console.error(`FAIL: the ladder count must live ONLY on the sticker, not the caption too (got '${fanSubs}')`); process.exit(1);
}
if (stickers.length < 20) { console.error(`FAIL: only ${stickers.length} topic cards carry a deck sticker`); process.exit(1); }
const front = stickers.reduce((a, b) => (b.w > a.w ? b : a));   // the upright, forward card
if (!front.topRight || !front.overhangs) {
  console.error(`FAIL: the deck sticker must overhang the card's top-right corner (got ${JSON.stringify(front)})`); process.exit(1);
}
if (!stickers.every((s) => /^\d\/5$/.test(s.text) && s.cap === "decks")) {
  console.error(`FAIL: every sticker must read 'n/5' over a 'decks' label (got ${JSON.stringify(stickers.slice(0, 3))})`); process.exit(1);
}
for (const [state, want] of [["fresh", "0/5"], ["climbing", null], ["cleared", "5/5"]]) {
  const hit = stickers.filter((s) => s.state === state);
  if (!hit.length) { console.error(`FAIL: no topic card rendered the '${state}' sticker state`); process.exit(1); }
  if (want && hit.some((s) => s.text !== want)) {
    console.error(`FAIL: '${state}' stickers must read ${want} (got ${JSON.stringify(hit.map((s) => s.text))})`); process.exit(1);
  }
}
console.log(`PASS: flashcards — ${stickers.length} topic cards wear the n/5 deck sticker on the top-right corner (fresh/climbing/cleared, caption no longer duplicates it)`);
// Topic pick under FULL MOTION — the real user path. The fan auto-rolls ("river") and
// each card is a moving, 3D-projected target; a stationary tap must still start a deck.
// Regression guard for the swallowed-click bug (2026-07-11): cards are pointer-events:
// none and the pick is resolved at the STAGE against live card rects, so a tap on the
// drifting coverflow opens the nearest topic. The old per-card onClick fell through to
// .fan-layout and did nothing — and this went uncaught because the pick was previously
// only ever exercised AFTER reduced motion froze the fan. Do NOT freeze it here.
await np.waitForTimeout(700); // let the river reach a steady roll (motion stays ON)
const fanBox = await np.locator(".fan-stage").boundingBox();
await np.mouse.click(Math.round(fanBox.x + fanBox.width / 2), Math.round(fanBox.y + fanBox.height / 2));
// ricoe B5: a topic pick shows an intro card (name + description) BEFORE Q1; Begin
// drops into the deck. The intro names the topic, so the title must be non-empty.
await np.waitForSelector('[data-testid="flash-intro"]', { timeout: 15000 });
if (((await np.locator('[data-testid="flash-intro"] .flash-intro-title').innerText()).trim().length) < 2) {
  console.error("FAIL: topic intro card is missing its title (ricoe B5)"); process.exit(1);
}
// The intro must be ON-SCREEN, not merely attached. Regression (2026-07-11 "blank after a
// topic pick"): the FlashShell background layers (.flash-engravings / .flash-bg) lost their
// `position:absolute` in the Grand Prix CSS rewrite, so they rendered IN FLOW, ballooned to
// ~20000px, and shoved .flash-content ~20000px below the viewport — the intro painted fine
// but entirely off-screen. waitForSelector/innerText pass on off-screen content, so the old
// checks never caught it. Assert the intro box actually sits within the viewport.
const introBox = await np.locator('[data-testid="flash-intro"]').boundingBox();
const vpH = np.viewportSize().height;
if (!introBox || introBox.y < -8 || introBox.y > vpH) {
  console.error(`FAIL: topic intro rendered OFF-SCREEN (top=${introBox?.y}, viewport=${vpH}) — content pushed out of view by in-flow background layers`); process.exit(1);
}
console.log("PASS: flashcards — topic intro renders ON-SCREEN (background layers stay out of flow)");
// Arcade copy (2026-07-12): kicker is no longer "On the grid", the meta counts "questions"
// not "laps", and the CTA is "Press start", not "Start your engines".
const introKicker = (await np.locator('.flash-intro-kicker').innerText()).toLowerCase();
if (/grid/.test(introKicker)) { console.error(`FAIL: intro kicker still racing copy (got '${introKicker}')`); process.exit(1); }
const introMeta = (await np.locator('.flash-intro-meta').innerText()).toLowerCase();
if (!/question/.test(introMeta) || /\blap/.test(introMeta)) { console.error(`FAIL: intro meta must count questions, not laps (got '${introMeta}')`); process.exit(1); }
const introCta = (await np.locator('[data-testid="flash-intro-begin"]').innerText()).toLowerCase();
if (/engine/.test(introCta)) { console.error(`FAIL: intro CTA still 'start your engines' (got '${introCta}')`); process.exit(1); }
console.log("PASS: flashcards — arcade intro copy (no grid / laps / engines)");
// The intro names WHICH rung is about to be played, so "10 questions" is never mistaken
// for the whole topic. The fan auto-rolls, so whichever card the click landed on decides
// what's expected: a topic is on the ladder, Mixed is not.
const introTitle = (await np.locator(".flash-intro-title").innerText()).trim().toLowerCase();
const introDeck = (await np.locator('[data-testid="flash-intro-deck"]').innerText()).toLowerCase();
if (introTitle !== "mixed" && !/deck \d of 5/.test(introDeck)) {
  console.error(`FAIL: the intro must name the ladder rung for topic '${introTitle}' (got '${introDeck}')`); process.exit(1);
}
if (introTitle === "mixed" && /deck \d of 5/.test(introDeck)) {
  console.error("FAIL: the Mixed deck spans topics — it has no rung and must not claim one"); process.exit(1);
}
console.log(`PASS: flashcards — the intro names which of the 5 decks is next ('${introDeck}')`);
if ((await np.locator('[data-testid="study-stage"]').count()) > 0) {
  console.error("FAIL: study stage shown before the intro's Begin (intro was skipped)"); process.exit(1);
}
console.log("PASS: flashcards — FULL-MOTION topic tap opens the intro (stage-resolved pick; ricoe B5)");
// The intro's top-left control steps BACK to the topic fan, not Home (2026-07-12): the intro
// is a "which topic?" beat, so its natural back is the picker — routing to /dashboard from
// here stranded a student who only wanted a different deck. Assert the label reads "Topics"
// (not "Home"), clicking it re-shows the fan, and we never left /flashcards.
const introExitLabel = (await np.locator('[data-testid="flash-exit"]').innerText()).trim().toLowerCase();
if (introExitLabel === "home") { console.error("FAIL: intro back control still labelled 'Home' — it must return to Topics, not the dashboard"); process.exit(1); }
if (!/topic/.test(introExitLabel)) { console.error(`FAIL: intro back control label = '${introExitLabel}', expected 'Topics'`); process.exit(1); }
await np.locator('[data-testid="flash-exit"]').click();
await np.waitForSelector('[data-testid="flash-fan"]', { timeout: 15000 });
if ((await np.locator('[data-testid="flash-intro"]').count()) > 0) { console.error("FAIL: intro still shown after its back control — did not return to topic selection"); process.exit(1); }
if (new URL(np.url()).pathname !== "/flashcards") { console.error(`FAIL: intro back navigated away (url=${np.url()}) — must return to the topic fan, not the dashboard`); process.exit(1); }
console.log("PASS: flashcards — intro back control returns to the topic fan (not Home)");
// Re-pick a topic to restore the intro for the downstream Begin → study assertions.
await np.waitForTimeout(700);
const fanBox2 = await np.locator(".fan-stage").boundingBox();
await np.mouse.click(Math.round(fanBox2.x + fanBox2.width / 2), Math.round(fanBox2.y + fanBox2.height / 2));
await np.waitForSelector('[data-testid="flash-intro"]', { timeout: 15000 });
// Enter the study deck in FULL MOTION (the real user path) and assert the MCQ options
// actually PAINT. Regression (2026-07-11 "blank card after a topic pick"): a
// referenced-but-undefined @keyframes flash-rise left .flash-option stranded at its base
// opacity:0 in full motion, so every answer was invisible — the card body read as blank.
// Reduced motion HID the bug (it force-sets .flash-option opacity:1), and the harness only
// ever .click()ed an option (which works even at opacity:0) under reduced motion — so it
// never caught it. Assert real paint here, motion ON, BEFORE collapsing motion below.
await np.locator('[data-testid="flash-intro-begin"]').click();
await np.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });
try {
  await np.waitForFunction(() => {
    const els = [...document.querySelectorAll('[data-testid="flash-option"]')];
    return els.length >= 2 && els.every((el) => parseFloat(getComputedStyle(el).opacity) > 0.9);
  }, { timeout: 6000 });
} catch {
  const ops = await np.evaluate(() => [...document.querySelectorAll('[data-testid="flash-option"]')].map((el) => getComputedStyle(el).opacity));
  console.error(`FAIL: flashcards MCQ options never painted in FULL motion (opacities ${JSON.stringify(ops)}) — invisible answers = blank card`); process.exit(1);
}
console.log("PASS: flashcards — MCQ options paint (opacity→1) in FULL motion, not invisible");

// Declutter (user, 2026-07-12): a single-select card locks INSTANTLY on tap — no "tap to
// lock — no submit" hint line, no submit control. The choice tiles fill the card instead.
if ((await np.locator('.flash-hint').count()) > 0) {
  console.error("FAIL: study card must not render the tap-to-lock hint text"); process.exit(1);
}
console.log("PASS: flashcards — no tap-to-lock hint clutter on the study card");

// Answer buttons are a dark NEUTRAL now (user, 2026-07-12) — never the old glossy red.
// The base fill must carry no red-dominant colour; red survives only as the ✗ wrong lock.
const optRed = await np.evaluate(() => {
  const el = document.querySelector('[data-testid="flash-option"]');
  if (!el) return { ok: false, rgbs: "no option" };
  const cs = getComputedStyle(el);
  const rgbs = [...(cs.backgroundColor + " " + cs.backgroundImage).matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)]
    .map((m) => [+m[1], +m[2], +m[3]]);
  const redDom = rgbs.some(([r, g, b]) => r > 150 && r > g * 1.6 && r > b * 1.6);
  return { ok: !redDom, rgbs };
});
if (!optRed.ok) { console.error(`FAIL: unpicked answer buttons must not be red (got ${JSON.stringify(optRed.rgbs)})`); process.exit(1); }
console.log("PASS: flashcards — answer buttons are neutral, not red");

// Regression (2026-07-12): a WRONG-locked option must stay painted. `.flash-option.is-wrong`
// sets its own `animation` (the shake), which REPLACES the entry `flash-rise` — without an
// explicit opacity:1 the option reverts to its base opacity:0 and vanishes (a blank gap where
// the red ✗ belongs; the shake itself never showed). Same failure class as the flash-rise bug.
const wrongOpacity = await np.evaluate(() => {
  const el = document.querySelector('[data-testid="flash-option"]');
  if (!el) return null;
  el.classList.add("is-wrong");
  void el.offsetWidth; // force reflow so the swapped animation takes effect
  const op = parseFloat(getComputedStyle(el).opacity);
  el.classList.remove("is-wrong");
  return op;
});
if (wrongOpacity === null || wrongOpacity < 0.9) {
  console.error(`FAIL: a wrong-locked answer must stay visible in FULL motion (is-wrong opacity ${wrongOpacity})`); process.exit(1);
}
console.log("PASS: flashcards — wrong-locked answer stays painted (opacity→1), not a blank gap");

// Now collapse motion for the deterministic study charge/flip path below: a single-answer
// tap locks an INSTANT verdict on the FRONT face, a beat plays, then the card FLIPS to a
// full-bleed back face carrying the model answer ("Findings") + a payoff.
await np.emulateMedia({ reducedMotion: "reduce" });

// Card 1 (plain): tap an option → flip → back face shows "Findings" + payoff. There
// is NO Check/submit button. Next is held for a short settle, then enables.
await np.locator('[data-testid="flash-option"]').first().click();
await np.waitForSelector('[data-testid="flash-reveal-back"]', { timeout: 8000 });
if ((await np.locator('[data-testid="flash-check"]').count()) > 0) {
  console.error("FAIL: flashcards must not have a Check/submit button"); process.exit(1);
}
if ((await np.locator('.flash-compare-label:has-text("Explanation")').count()) < 1) {
  console.error("FAIL: flashcards model answer not revealed under an 'Explanation' label on the back face"); process.exit(1);
}
if ((await np.locator('[data-testid="flash-payoff"]').count()) < 1) {
  console.error("FAIL: flashcards reveal is missing the gamification payoff"); process.exit(1);
}
// Arcade payoff (2026-07-12): a correct reveal shouts "PERFECT!", never the racing "BOOST!".
const payoffV = (await np.locator('[data-testid="flash-payoff"] .flash-payoff-verdict').innerText()).toLowerCase();
if (/boost/.test(payoffV) || !/perfect/.test(payoffV)) {
  console.error(`FAIL: correct reveal must read 'PERFECT', not 'BOOST' (got '${payoffV}')`); process.exit(1);
}
if (await np.locator('[data-testid="flash-advance"]').isEnabled()) {
  console.error("FAIL: Next should be settle-gated immediately after the flip"); process.exit(1);
}
console.log("PASS: flashcards — plain tap flips to a full-bleed payoff; Next is settle-gated");
// Advance is "Next →" / "Finish →" now — never the racing "Next lap →".
await np.waitForFunction(() => { const b = document.querySelector('[data-testid="flash-advance"]'); return b && !b.disabled; }, { timeout: 4000 });
const advTxt = (await np.locator('[data-testid="flash-advance"]').innerText()).toLowerCase();
if (/lap/.test(advTxt)) { console.error(`FAIL: advance button still races ('lap' in '${advTxt}')`); process.exit(1); }
console.log("PASS: flashcards — advance label de-raced (no 'lap')");

// ── Flashcards is a DARK ARCADE world (2026-07-12 — supersedes "Grand Prix"). The study
// card is graphite on BOTH faces (front = where you answer, back = the payoff + Explanation),
// so the glowing topic rim + neutral buttons pop. Assert both faces are a genuinely dark
// surface (never a bright study card).
const d2 = await np.evaluate(() => {
  const lum = (c) => { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(c || ""); return m ? (+m[1] * 0.299 + +m[2] * 0.587 + +m[3] * 0.114) : null; };
  const front = document.querySelector(".flash-card .flash-face.is-front");
  const back = document.querySelector(".flash-card .flash-face.is-back");
  return {
    front: front ? getComputedStyle(front).backgroundColor : "",
    back: back ? getComputedStyle(back).backgroundColor : "",
    frontLum: front ? lum(getComputedStyle(front).backgroundColor) : null,
    backLum: back ? lum(getComputedStyle(back).backgroundColor) : null,
  };
});
if (d2.frontLum === null || d2.frontLum > 90) {
  console.error(`FAIL: study card front face must be a dark graphite (got '${d2.front}')`); process.exit(1);
}
if (d2.backLum === null || d2.backLum > 90) {
  console.error(`FAIL: reveal back face must be a dark graphite (got '${d2.back}')`); process.exit(1);
}
console.log("PASS: flashcards — dark arcade study card (front + reveal both graphite)");

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
if (await np.locator('.flash-compare-label:has-text("Explanation")').isVisible()) {
  console.error("FAIL: model answer shown before the learner's reasoning on a reason card"); process.exit(1);
}
if (await np.locator('[data-testid="flash-advance"]').isVisible()) {
  console.error("FAIL: Next should not be visible until the reveal is charged"); process.exit(1);
}
await np.locator('[data-testid="flash-reason"]').fill("Immediate irrigation limits ongoing damage.");
await np.locator('[data-testid="flash-reveal-model"]').click();
await np.waitForSelector('.flash-compare-label:has-text("Explanation")', { timeout: 8000 });
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
await np.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
await np.waitForSelector('.aurora-navitem:has-text("Homepage")', { timeout: 15000 });
if ((await np.locator('.aurora-snec[alt="Singapore National Eye Centre"]').count()) < 1) {
  console.error("FAIL: SNEC logo missing from the Atlas Rail"); process.exit(1);
}
console.log("PASS: SNEC logo present in the Atlas Rail");

// (The Profile screen was removed with the Eyecon work; reduced-motion freezing of the
//  home mascot is covered by the emulateMedia test further below.)

// Avatar mock for the greeting + leaderboard sections below: an already-customized student
// (so the mandatory first-login gate stays quiet) whose portrait hasn't rendered. The Eyecon
// Studio + gate behaviour is covered end-to-end by eyecon_assert.mjs. PORTRAIT_PNG is a 1×1
// transparent PNG standing in for a RETIRED portrait_url — the board now renders the
// config-driven composite and IGNORES portrait_url, so rows that still carry one verify that.
const PORTRAIT_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const DEFAULT_CFG = { version: 2, bodyColor: "peach", irisColor: "blue", eyeShape: "round", lashes: "natural", mouth: "smile", blush: "peach", glasses: "none", topper: "none", accessory: "none", outfit: "none", background: "mist" };
await navCtx.route("**/api/avatar", (r) =>
  r.fulfill(JSON_OK({ config: DEFAULT_CFG, axes: {}, customized: true, portrait_status: "none", portrait_url: null })));
// The greeting card is ALWAYS the default living mascot (brand EyeconLogo), even for a
// customized student — the custom Eyecon lives only on the home popover + leaderboard.
await np.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
await np.waitForSelector('.hm-iriswrap [data-testid="eyecon-logo"]', { timeout: 15000 });
if ((await np.locator(".hm-eyecon img.hm-eyecon-img").count()) > 0) {
  console.error("FAIL: greeting shows a custom render for a customized student (should always be the default mascot)"); process.exit(1);
}
const greetRestSrc = (await np.locator('.hm-iriswrap [data-testid="eyecon-logo"] .eyecon-logo-rest').getAttribute("src")) ?? "";
if (!/\/brand\/iris\.png/.test(greetRestSrc)) { console.error(`FAIL: greeting mascot is not the default iris.png (src=${greetRestSrc})`); process.exit(1); }
console.log("PASS: Home greeting — always the DEFAULT living mascot, even when customized");

// Leaderboard — vibrant & seamless (supersedes "The Climb"): podium (top 3) + one
// color-graded ranked list + a personal chase hook. Everyone-by-default: the show/hide-self
// switch and nickname field were deliberately dropped with the BoardSettings strip (214ab7f),
// so there is no opt-out UI left to verify. The GET mock honours ?role= so the filter stays a
// real behavioral verify.
// `xp` is now the WEEKLY score (ranking key); `xp_total` is lifetime XP (tier ring).
// `avatar_config` must carry REAL customization to exercise the config-driven Eyecon: since
// 15c853b a config whose look axes are all default renders the iris.png mascot, and
// `background` is only the backdrop — not a look axis — so the old `{ background: … }`-only
// rows silently became never-customized accounts and stopped producing any /avatar/ layer.
// Aisha takes the LIBRARY path (config.portrait → one baked tile), Wei Jie the COMPOSITOR
// path (a non-default look axis → /avatar/base + overlays); the rest stay un-customized.
const LB_ROWS = [
  { name: "Aisha R.",   role: "OT", xp: 12480, xp_total: 12480, level: 24, streak_days: 31, avatar_config: { portrait: "outfit/astronaut", background: "galaxy" }, portrait_url: PORTRAIT_PNG, is_you: false },
  { name: "Wei Jie T.", role: "OA", xp: 10240, xp_total: 10240, level: 22, streak_days: 18, avatar_config: { bodyColor: "mint", topper: "crown", background: "mist" }, portrait_url: null, is_you: false },
  { name: "Priya N.",   role: "OT", xp: 7720,  xp_total: 7720,  level: 18, streak_days: 12, avatar_config: null, portrait_url: null, is_you: false },
  { name: "You",        role: "OA", xp: 7660,  xp_total: 7660,  level: 17, streak_days: 9,  avatar_config: { background: "peach" }, portrait_url: null, is_you: true },
  { name: "Marcus L.",  role: "OT", xp: 7635,  xp_total: 7635,  level: 17, streak_days: 6,  avatar_config: null, portrait_url: PORTRAIT_PNG, is_you: false },
  { name: "Siti N.",    role: "OA", xp: 6120,  xp_total: 6120,  level: 15, streak_days: 22, avatar_config: null, portrait_url: null, is_you: false },
  { name: "Daniel O.",  role: "OT", xp: 5540,  xp_total: 5540,  level: 14, streak_days: 0,  avatar_config: null, portrait_url: null, is_you: false },
];
await navCtx.route("**/api/leaderboard**", (r) => {
  const role = new URL(r.request().url()).searchParams.get("role");
  const rows = role ? LB_ROWS.filter((e) => e.role === role) : LB_ROWS;
  const entries = rows.map((e, i) => ({ ...e, rank: i + 1, division: 2, rank_delta: i % 3 === 0 ? null : 1 }));
  return r.fulfill(JSON_OK({
    entries, you_hidden: false, display_name: null, roles: ["OA", "OT"],
    division: 2, division_name: "Silver", pool_size: 7, promote_count: 3,
  }));
});
// No Monday ceremony here: it is a full-screen overlay mounted from AppShell, and it would
// swallow every click below. Its own gate is league_assert.mjs.
await navCtx.route("**/api/league/result", (r) => r.fulfill(JSON_OK({ result: null })));
await np.goto(base + "/leaderboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="podium-slot"]', { timeout: 15000 });
const lbH1 = await np.locator("main h1").count();
if (lbH1 !== 1) { console.error(`FAIL: leaderboard main h1 count = ${lbH1}`); process.exit(1); }
if ((await np.locator('[data-testid="podium-slot"]').count()) !== 3) { console.error("FAIL: leaderboard podium did not render 3 slots"); process.exit(1); }
if ((await np.locator('[data-testid="lb-row"]').count()) !== 4) { console.error("FAIL: expected 4 ranked rows below the podium"); process.exit(1); }
if ((await np.locator('[data-testid="leaderboard-root"] .eyecon-layer[src^="/avatar/"]').count()) < 1) {
  console.error("FAIL: leaderboard did not render any student's composited Eyecon (config-driven /avatar layer)"); process.exit(1);
}
if ((await np.locator('[data-testid="leaderboard-root"] .eyecon-layer[src^="data:"]').count()) !== 0) {
  console.error("FAIL: leaderboard still renders a retired portrait_url instead of the composite"); process.exit(1);
}
const youRow = np.locator('[data-testid="lb-row"][data-you]');
if ((await youRow.count()) !== 1 || !(await youRow.innerText()).includes("You")) {
  console.error("FAIL: current user's row not highlighted on the leaderboard"); process.exit(1);
}
// The chase — the viewer is rank 4 with the top 3 promoting, so it must state the climb.
const lbChase = np.locator('[data-testid="chase"]');
if ((await lbChase.count()) !== 1 || !/promotion zone/i.test(await lbChase.innerText())) {
  console.error("FAIL: leaderboard chase stat not showing the gap to the promotion zone"); process.exit(1);
}
// Weekly league: the countdown tells students when the race closes (Monday, SGT).
const lbReset = np.locator('[data-testid="lb-reset"]');
if ((await lbReset.count()) !== 1 || !/closes in/i.test(await lbReset.innerText())) {
  console.error("FAIL: leaderboard week-close countdown ([data-testid=lb-reset]) missing"); process.exit(1);
}
// The privacy opt-out must be reachable — it was exported and imported by nothing for weeks.
if ((await np.locator('[data-testid="lb-hide-switch"]').count()) !== 1) {
  console.error("FAIL: the leaderboard hide-me switch is missing (privacy opt-out unreachable)"); process.exit(1);
}
if ((await np.locator('[data-testid="edit-selena"]').count()) !== 0) { console.error("FAIL: a legacy Edit-Eyecon control still exists on the leaderboard"); process.exit(1); }
console.log("PASS: Leaderboard — Beam, league list, chase stat, you-row highlight, composited Eyecon (portrait_url ignored), privacy switch reachable");

// role filter narrows the WHOLE board (podium + rows) and drops the other role.
await np.locator('.lb-filter .lb-chip:has-text("OT")').click();
await np.waitForFunction(() => document.querySelectorAll('[data-testid="podium-slot"], [data-testid="lb-row"]').length === 4, { timeout: 8000 });
console.log("PASS: Leaderboard — role filter narrows the board");
await np.locator('.lb-filter .lb-chip:has-text("All")').click();
await np.waitForFunction(() => document.querySelectorAll('[data-testid="podium-slot"], [data-testid="lb-row"]').length === 7, { timeout: 8000 });

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
// /profile was retired with the Eyecon rename and now 404s → the app bounces it to
// /dashboard, so this sweep was silently measuring /dashboard TWICE and calling it coverage.
// /leaderboard is a real shell route (rail + one h1), which is what this slot meant to be.
const A11Y_ROUTES = ["/homepage", "/chat", "/cases", "/flashcards", "/leaderboard"];
await np.setViewportSize({ width: 1440, height: 900 });
for (const r of A11Y_ROUTES) {
  await np.goto(base + r, { waitUntil: "domcontentloaded" });
  // Poll the DOM for the condition this loop actually asserts, rather than holding an element
  // handle: waitForSelector resolves a HANDLE, and a screen that re-renders while settling
  // (the Tutor landing does) can swap the h1 out from under it — the wait then never
  // satisfies even though the page is fine. That flaked ~50% of Linux CI runs with
  // "locator resolved to visible <h1 class=tl-hello> … Timeout". Polling is immune to the
  // swap and still fails honestly if the h1 never arrives or never settles at exactly one.
  await np.waitForFunction(() => document.querySelectorAll("main h1").length === 1, null, { timeout: 15000, polling: 100 });
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
  await np.waitForFunction(() => document.querySelectorAll("main h1").length === 1, null, { timeout: 15000, polling: 100 });
  await np.waitForTimeout(250);
  const o = await np.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o > 2) { console.error(`FAIL: 390px overflow on ${r} = ${o}px`); process.exit(1); }
}
console.log("PASS: a11y — no horizontal overflow at 390px on any route");
await np.setViewportSize({ width: 1440, height: 900 });

// reduced motion: emulate prefers-reduced-motion; a .aurora-flow surface freezes.
const rmPage = await navCtx.newPage();
await rmPage.emulateMedia({ reducedMotion: "reduce" });
await rmPage.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
await rmPage.waitForSelector('[data-testid="streak-tile"]', { timeout: 15000 });
const rmAnim = await rmPage.locator(".hm-iris").first().evaluate((el) => getComputedStyle(el).animationName);
if (rmAnim !== "none") { console.error(`FAIL: reduced motion did not freeze the mascot (animationName=${rmAnim})`); process.exit(1); }
console.log("PASS: reduced motion freezes the home mascot animation");

// (The mandatory first-login gate — uncustomized → forced/unskippable welcome Studio,
//  customized → never gated, re-customization locked — is covered end-to-end by
//  frontend/tests/eyecon_assert.mjs, which drives the served build with customized:false /
//  customized:true avatar mocks.)

// staff dashboard: /admin + /supervisor and the `supervisor` role no longer exist — the
// console was deleted and replaced by ONE dark /admin surface for trainer+admin, so the
// two blocks that used to live here tested routes that 404 and roles the app never issues.
// Retargeted at the surface that exists: AdminGuard admits staff, the cohort tab renders
// KPIs off the (still-live) /api/supervisor/* endpoints, and the admin-only Accounts tab
// stays hidden from a trainer. The student-rejection check is the one that matters most —
// this surface exposes the whole cohort's data.
// P2 cohort-analytics fixture. The two pools are disjoint curricula (D2), so slicing by
// discipline must change the ROW SET, not just a label — that is what proves the switcher
// re-queries rather than filtering a cached payload client-side. set_keys/labels are the
// real ones from tools/cases/topic_sets.py.
const CA_CLINICAL = [
  { topic_group: "tonometry_iop", label: "Intraocular Pressure", pool: "CLINICAL",
    osce: { attempts: 14, students: 9, avg_score: 62.4, scored_n: 12, pass_rate: 0.58, graded_n: 12,
            safety_fail_rate: 0.25, safety_gradable_n: 12,
            missed_top: [{ step: "Checked intraocular pressure before dilation", count: 5, students: 4 }],
            by_difficulty: { beginner: 6, intermediate: 5, advanced: 3 } },
    flashcard: { accuracy: 71.0, n: 180, students: 9 },
    weakness_score: 0.68, low_confidence: false, signals_present: ["osce_score", "osce_pass", "safety", "flashcard"] },
  { topic_group: "triage_referral", label: "Triage & Referral", pool: "CLINICAL",
    osce: { attempts: 4, students: 3, avg_score: 58.0, scored_n: 4, pass_rate: 0.5, graded_n: 4,
            safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
            by_difficulty: { beginner: 2, intermediate: 2, advanced: 0 } },
    flashcard: { accuracy: 55.0, n: 18, students: 3 },
    weakness_score: 0.62, low_confidence: true, signals_present: ["osce_score", "flashcard"] },
];
const CA_OT = [
  { topic_group: "oct_imaging", label: "OCT Imaging", pool: "OT",
    osce: { attempts: 9, students: 6, avg_score: 74.1, scored_n: 8, pass_rate: 0.75, graded_n: 8,
            safety_fail_rate: 0.0, safety_gradable_n: 8,
            missed_top: [{ step: "Confirmed patient identity and operative eye", count: 2, students: 2 }],
            by_difficulty: { beginner: 4, intermediate: 3, advanced: 2 } },
    flashcard: { accuracy: 72.0, n: 25, students: 3 },
    weakness_score: 0.34, low_confidence: false, signals_present: ["osce_score", "osce_pass", "safety", "flashcard"] },
  { topic_group: "visual_fields", label: "Visual Field Testing", pool: "OT",
    osce: { attempts: 3, students: 2, avg_score: 49.0, scored_n: 3, pass_rate: 0.33, graded_n: 3,
            safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
            by_difficulty: { beginner: 1, intermediate: 2, advanced: 0 } },
    flashcard: null,
    weakness_score: 0.71, low_confidence: true, signals_present: ["osce_score"] },
];
// unclassified_students and staff_excluded are population-wide diagnostics, so they read
// the same in every discipline view — only the in-pool figures move. unknown_tag_attempts
// IS view-scoped (it counts only in-view students' unmatched tags), so it moves too.
const CA_TOTALS = {
  all:    { students_in_pool: 22, students_with_osce_data: 15, students_with_flashcard_data: 9, osce_students: 15, unclassified_students: 2, unclassified_attempts: 1, staff_excluded: 1, unknown_tag_attempts: 3 },
  oa_psa: { students_in_pool: 14, students_with_osce_data: 9,  students_with_flashcard_data: 9, osce_students: 9,  unclassified_students: 2, unclassified_attempts: 1, staff_excluded: 1, unknown_tag_attempts: 2 },
  ot:     { students_in_pool: 8,  students_with_osce_data: 6,  students_with_flashcard_data: 3, osce_students: 6,  unclassified_students: 2, unclassified_attempts: 1, staff_excluded: 1, unknown_tag_attempts: 1 },
};
// The scoring rubric travels with the scores (tools/supervisor/cohort_analytics.py::
// WEIGHT_RUBRIC) — static in every slice, so it is hoisted out of the handler below to
// leave only the discipline-varying parts inline.
const CA_RUBRIC = {
  version: 1,
  weights: { osce_score: 0.4, osce_pass: 0.25, safety: 0.2, flashcard: 0.15 },
  scales: { osce_score: 100.0, osce_pass: 1.0, safety: 1.0, flashcard: 100.0 },
  confidence: { min_students: 3, min_attempts: 5, shrinkage_k: 5 },
  caveats: { safety: "safe = not missed_critical, and missed_critical only fills for steps flagged critical — so an attempt on a checklist with NO critical step counts as safe while carrying no safety signal. safety_fail_rate is therefore diluted downward on those groups; read it with safety_gradable_n." },
};
const staffMocks = async (c) => {
  await c.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
  // at_risk_count is now literally len(get_at_risk()) (cohort_summary.py), so it MUST
  // equal the number of rows in the at-risk fixture below. It said 3 beside a 1-row list.
  await c.route("**/api/supervisor/cohort", (r) => r.fulfill(JSON_OK({ total_students: 24, total: 24, active_this_week: 17, at_risk_count: 2, weakest_topics: [{ topic: "Glaucoma staging", count: 14 }, { topic: "OCT interpretation", count: 9 }] })));
  // Both rows are the EXACT output of score_student for the student described, not
  // hand-picked numbers: reason weights are renormalised contributions that sum to the
  // score (risk_model.py:229,244), so 66 cannot come with reasons totalling 51.
  // Row 1: 20 days idle, streak broken, 2 weak topics, 9 of 12 attempts failed unsafely.
  // Row 2: never started, so days_inactive is null — the state that rendered
  // "Noned inactive" in the digest, and the one a fixture has to cover.
  await c.route("**/api/supervisor/at-risk", (r) => r.fulfill(JSON_OK({ students: [
    { student_id: "S009ABCDEF", risk_score: 66, band: "high",
      reasons: [
        { factor: "inactivity", weight: 22.0, detail: "No activity for 20 days" },
        { factor: "osce_failure", weight: 19.4, detail: "Failed 9 of 12 graded OSCE attempts" },
        { factor: "safety", weight: 14.2, detail: "Safety fail on 9 of 12 gradable attempts" },
        { factor: "streak_broken", weight: 7.3, detail: "Check-in streak is broken" },
        { factor: "weak_breadth", weight: 2.9, detail: "2 weak topics recorded" },
      ],
      last_active: new Date(Date.now() - 20 * 864e5).toISOString(), days_inactive: 20,
      weak_topics: ["Glaucoma staging", "OCT interpretation"], weak_count: 2 },
    { student_id: "S014BCDEFA", risk_score: 41, band: "medium",
      reasons: [{ factor: "flashcard", weight: 40.9, detail: "Flashcard accuracy 57% over 88 answers" }],
      last_active: "", days_inactive: null, weak_topics: [], weak_count: 0 },
  ] })));
  await c.route("**/api/supervisor/insights", (r) => r.fulfill(JSON_OK({ narrative: "Cohort momentum is improving; glaucoma staging remains the weakest area." })));
  await c.route("**/api/supervisor/benchmarks", (r) => r.fulfill(JSON_OK({ topics: [{ topic: "Glaucoma staging", avg_score: 0.42, student_count: 14 }, { topic: "OCT interpretation", avg_score: 0.61, student_count: 12 }] })));
  await c.route("**/api/admin/token-summary", (r) => r.fulfill(JSON_OK({ total_tokens: 48213, complete: true, by_student: [{ student_id: "S001", tokens: 48213 }] })));
  await c.route("**/api/admin/students", (r) => r.fulfill(JSON_OK({ students: [{ student_id: "S001", full_name: "Test Student", email: "student@snec.com.sg", role: "OA", session_count: 18, streak: 6, last_active: new Date().toISOString(), learning_velocity: "improving" }] })));
  await c.route("**/api/admin/activity", (r) => r.fulfill(JSON_OK({ feed: [
    { type: "chat", student_id: "S001", name: "Test Student", detail: "Asked about gonioscopy", timestamp: new Date().toISOString(), token_count: 412 },
    { type: "case", student_id: "S001", name: "Test Student", detail: "Completed Glaucoma station", timestamp: new Date().toISOString(), case_id: "C001", total_score: 31, passed: true, score_100: 78, safe: true, missed_critical: [] },
  ] })));
  await c.route("**/api/admin/activity-trend*", (r) => r.fulfill(JSON_OK({ days: [
    { date: "2026-07-04", sessions: 2, cases: 1, total: 3 },
    { date: "2026-07-05", sessions: 4, cases: 0, total: 4 },
    { date: "2026-07-06", sessions: 1, cases: 2, total: 3 },
  ] })));
  // P2 §7 quality trend. Trailing `*` for the same reason as below. Answers from the
  // request so the window toggle really flips day→week bucketing and a discipline switch
  // is served a different series. The middle bucket is null across every metric on
  // purpose: that is the D13 gap the chart must draw as a BREAK in the line, not as a
  // cliff to the floor, so the harness loads the gap path rather than only a dense one.
  await c.route("**/api/admin/performance-trend*", (r) => {
    const url = new URL(r.request().url());
    const discipline = url.searchParams.get("discipline") ?? "all";
    const days = Number(url.searchParams.get("days") ?? 30);
    const period = days <= 31 ? "day" : "week";
    const base = discipline === "ot" ? 55 : discipline === "oa_psa" ? 70 : 64;
    const dates = period === "week"
      ? ["2026-07-13", "2026-07-20", "2026-07-27"]
      : ["2026-07-29", "2026-07-30", "2026-07-31"];
    return r.fulfill(JSON_OK({
      discipline, period, complete: true, points: [
        { date: dates[0], n: 3, avg_score: base - 4, pass_rate: 60, safety_fail_rate: 30 },
        { date: dates[1], n: 0, avg_score: null, pass_rate: null, safety_fail_rate: null },
        { date: dates[2], n: 5, avg_score: base + 6, pass_rate: 80, safety_fail_rate: 20 },
      ],
    }));
  });
  // Trailing `*` is mandatory — the hook always sends ?discipline=&days=, and a route
  // without it never matches a query string. Answers from the request so a discipline
  // switch is served a genuinely different ROW SET, the way the endpoint does.
  await c.route("**/api/admin/cohort-analytics*", (r) => {
    const url = new URL(r.request().url());
    const discipline = url.searchParams.get("discipline") ?? "all";
    const topics = discipline === "ot" ? CA_OT : discipline === "oa_psa" ? CA_CLINICAL : [...CA_CLINICAL, ...CA_OT];
    const totals = CA_TOTALS[discipline] ?? CA_TOTALS.all;
    return r.fulfill(JSON_OK({
      discipline, days: Number(url.searchParams.get("days") ?? 90), topics,
      totals: { ...totals, osce_attempts: topics.reduce((s, t) => s + t.osce.attempts, 0) },
      sources: { osce: "ok", flashcard: "ok" },
      rubric: CA_RUBRIC,
    }));
  });
};
const trainerUser = { full_name: "Cohort Trainer", email: "trainer@snec.com.sg", student_id: "T001", role: "trainer", student_role: "", must_change: false };
const trainerCtx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await trainerCtx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_checkin_date", new Date().toLocaleDateString("en-CA"));
  localStorage.setItem("eyebot_tour_seen", "true");
  localStorage.setItem("eyebot_rail_pinned", "1"); // pin the auto-collapsing rail open so nav items are clickable
}, trainerUser);
await trainerCtx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
await staffMocks(trainerCtx);
await trainerCtx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(trainerUser)));
const tp = await trainerCtx.newPage();
await tp.goto(base + "/admin", { waitUntil: "domcontentloaded" });
await tp.waitForSelector('[data-testid="stat-card"]', { timeout: 15000 });
if (new URL(tp.url()).pathname !== "/admin") { console.error(`FAIL: AdminGuard bounced a trainer off /admin (url=${tp.url()})`); process.exit(1); }
// P2b: /admin gets the SAME a11y landmark contract as the student shell routes, asserted
// here rather than in A11Y_ROUTES. That sweep drives the STUDENT context, and AdminGuard
// bounces a student off /admin — appending "/admin" there would silently measure the
// bounce destination and report it as coverage, which is exactly the /profile→/dashboard
// trap documented at the top of that sweep. The staff surface is the largest screen in the
// app and the only one a trainer uses for real work, so it earns the check, not an
// exemption. Only the LANDMARK half was actually missing: horizontal overflow at phone
// widths is already a hard gate for /admin in mobile_audit (0/30 across five viewports),
// so re-checking it here would duplicate a stronger check with a weaker one.
const anMains = await tp.locator("main").count();
const anH1 = await tp.locator("main h1").count();
const anNavs = await tp.locator("nav").count();
if (anMains !== 1 || anH1 !== 1 || anNavs < 1) { console.error(`FAIL: a11y landmarks on /admin (main=${anMains}, h1=${anH1}, nav=${anNavs})`); process.exit(1); }
// the KPIs read the payload rather than rendering placeholders: at_risk_count 2 → "At risk".
const atRiskCard = tp.locator('[data-testid="stat-card"]:has(.aurora-statcard-label:text-is("At risk"))');
if ((await atRiskCard.count()) !== 1) { console.error("FAIL: cohort tab missing the 'At risk' KPI card"); process.exit(1); }
const atRiskVal = (await atRiskCard.locator(".aurora-statcard-value").innerText()).trim();
if (atRiskVal !== "2") { console.error(`FAIL: 'At risk' KPI = '${atRiskVal}', expected the payload's 2`); process.exit(1); }
// P2b: at_risk_count IS len(get_at_risk()) (cohort_summary.py), so the KPI and the list
// beneath it can no longer disagree. AdminCohort.tsx:42 PREFERS the count, so a drift
// would show the wrong number above a correct list, on one screen.
// Wait FIRST: useAtRisk is a separate fetch from useCohort, and locator.count() does not
// auto-wait. Counting straight after the KPI assertion reads 0 off the still-mounted
// PanelSkeleton whenever at-risk resolves a tick later, i.e. a red CI run on correct code.
await tp.waitForSelector('[data-testid="risk-band"]', { timeout: 15000 });
const riskRowCount = await tp.locator('[data-testid="risk-band"]').count();
if (String(riskRowCount) !== atRiskVal) {
  console.error(`FAIL: 'At risk' KPI = ${atRiskVal} but the list beneath it has ${riskRowCount} rows`); process.exit(1);
}
// D7: the row must say WHY. A coloured band with no explanation is the old binary flag
// wearing a pill, and the digest/console are the only places a trainer sees this.
const riskReason = await tp.locator('[data-testid="risk-reason"]').first().textContent();
if (!riskReason?.includes("No activity for 20 days")) {
  console.error(`FAIL: at-risk row does not explain WHY the student is flagged (got ${riskReason})`); process.exit(1);
}
if ((await tp.locator('[data-testid="risk-band"][data-band="high"]').count()) !== 1) {
  console.error("FAIL: at-risk high-band pill missing"); process.exit(1);
}
// The medium row carries days_inactive: null — the state that rendered "Noned inactive"
// in the digest. It must still show a score and a reason, not a blank or a "0".
if ((await tp.locator('[data-testid="risk-band"][data-band="medium"]').count()) !== 1) {
  console.error("FAIL: at-risk medium-band pill missing"); process.exit(1);
}
const riskScores = (await tp.locator('[data-testid="risk-score"]').allInnerTexts()).join(" ");
if (!riskScores.includes("66") || !riskScores.includes("41")) {
  console.error(`FAIL: at-risk scores not rendered from the payload (got ${riskScores})`); process.exit(1);
}
// Truncated to the 3 heaviest: row 1 carries 5 reasons, row 2 carries 1.
const reasonCount = await tp.locator('[data-testid="risk-reason"]').count();
if (reasonCount !== 4) {
  console.error(`FAIL: expected 4 reason chips (3 capped + 1), got ${reasonCount}`); process.exit(1);
}
if ((await tp.locator('[role="tab"]:has-text("Accounts")').count()) !== 0) {
  console.error("FAIL: the admin-only Accounts tab is exposed to a trainer"); process.exit(1);
}
console.log("PASS: Admin — guard admits a trainer, cohort KPIs read the payload, no admin-only Accounts tab");

// P2 §5.4 / D11: the discipline switcher is PANEL-LOCAL, and the caption is the only thing
// telling a trainer that the KPI tiles and token usage ABOVE it are not filtered. Without
// it the control silently re-promises console-wide scoping — the false promise P1 deleted
// from the Admin shell. Pinned verbatim so a well-meaning copy edit can't quietly drop the
// scope clause.
const discCaption = tp.locator('[data-testid="cohort-discipline-caption"]');
if ((await discCaption.count()) !== 1) { console.error("FAIL: cohort-analytics panel is missing the discipline-scope caption (D11)"); process.exit(1); }
const discText = (await discCaption.innerText()).trim();
const DISC_CAPTION = "Discipline: All · OA & PSA · OT — filters the topic panels below; cohort totals and token usage cover all disciplines.";
if (discText !== DISC_CAPTION) { console.error(`FAIL: discipline caption drifted from the spec\n  got:  '${discText}'\n  want: '${DISC_CAPTION}'`); process.exit(1); }
// The panel must be reading the endpoint, not the activity feed: 2 CLINICAL + 2 OT groups.
await tp.waitForSelector('[data-testid="cohort-topics-summary"]', { timeout: 15000 });
const caAll = (await tp.locator('[data-testid="cohort-topics-summary"]').innerText()).trim();
if (!caAll.startsWith("4 topic groups")) { console.error(`FAIL: cohort-analytics summary did not render the payload's 4 topic groups (got '${caAll}')`); process.exit(1); }
// Switching discipline must issue a NEW server request carrying the new param. A purely
// client-side filter would leave OT trainers looking at OA/PSA numbers, and the curricula
// are disjoint — there is no correct client-side subset. Arm the wait BEFORE the click.
const caOtReq = tp.waitForRequest(
  (r) => r.url().includes("/api/admin/cohort-analytics") && new URL(r.url()).searchParams.get("discipline") === "ot",
  { timeout: 8000 },
).catch(() => null);
await tp.locator('[data-testid="cohort-discipline"] button[data-discipline="ot"]').click();
if (!(await caOtReq)) { console.error("FAIL: switching the discipline switcher issued no /api/admin/cohort-analytics request with discipline=ot"); process.exit(1); }
await tp.waitForFunction(() => {
  const el = document.querySelector('[data-testid="cohort-topics-summary"]');
  return !!el && el.textContent.trim().startsWith("2 topic groups");
}, null, { timeout: 8000 });
console.log("PASS: Admin — panel-local discipline switcher states its scope and re-queries the server with the new discipline");

// P2 §7 / D13: the quality trend. The one thing worth pinning in a BROWSER is that a null
// bucket survives all the way to pixels as a BREAK in the line. Every other line on this
// board touches the floor when it means zero, so the cheap bug — mapping null to 0 in the
// view layer — would look completely normal and would draw a cliff to the floor on any
// quiet day, i.e. exactly the cohort collapse the endpoint refuses to report. The fixture
// nulls the middle bucket of three, so every series must render as two subpaths.
const trendPanel = tp.locator('[data-testid="performance-trend"]');
if ((await trendPanel.count()) !== 1) { console.error("FAIL: /admin is missing the performance-trend panel"); process.exit(1); }
await trendPanel.locator("svg.aurora-trend").waitFor({ timeout: 15000 });
const trendSubpaths = await trendPanel.locator("svg.aurora-trend path").evaluateAll(
  (els) => els.map((e) => ((e.getAttribute("d") || "").match(/M/g) || []).length));
if (trendSubpaths.length !== 3) { console.error(`FAIL: expected one line per metric (avg score, pass rate, safety failures), got ${trendSubpaths.length}`); process.exit(1); }
if (!trendSubpaths.every((n) => n === 2)) { console.error(`FAIL: a null bucket was drawn THROUGH instead of as a gap — subpath counts ${JSON.stringify(trendSubpaths)}, want [2,2,2]`); process.exit(1); }
// The legend readout and the summary must read the payload, not a placeholder: the
// fixture is 3 + 0 + 5 attempts, newest real average 70.
const trendLegend = (await trendPanel.locator('[data-testid="trend-legend"]').innerText()).trim();
if (!trendLegend.includes("70%")) { console.error(`FAIL: trend legend did not read the newest real average from the payload (got '${trendLegend}')`); process.exit(1); }
const trendSummaryText = (await trendPanel.locator('[data-testid="trend-summary"]').innerText()).trim();
if (!trendSummaryText.startsWith("8 station attempts")) { console.error(`FAIL: trend summary did not total the payload's attempts (got '${trendSummaryText}')`); process.exit(1); }
// Above 31 days the server rolls up to weeks, so the window toggle changes the MEANING of
// a point, not just its span — the caption has to follow it or the axis silently lies.
const trendWeekReq = tp.waitForRequest(
  (r) => r.url().includes("/api/admin/performance-trend") && new URL(r.url()).searchParams.get("days") === "90",
  { timeout: 8000 },
).catch(() => null);
await trendPanel.locator('[data-testid="trend-window"] button[data-days="90"]').click();
if (!(await trendWeekReq)) { console.error("FAIL: the trend window toggle issued no /api/admin/performance-trend request with days=90"); process.exit(1); }
await tp.waitForFunction(() => {
  const el = document.querySelector('[data-testid="trend-caption"]');
  return !!el && el.textContent.includes("Per week");
}, null, { timeout: 8000 });
console.log("PASS: Admin — performance trend breaks the line at empty buckets, reads the payload, and follows day→week rollup");

// P2 §5.5: the panels derived from /api/admin/activity are retired. That feed is capped
// at 80 items server-side, so every cohort aggregate built on it described only the most
// recent slice — and sat next to the uncapped cohort-analytics panel showing different
// numbers. The activity fixture above carries ONE case attempt with safe:true and an empty
// missed_critical, so the old code renders "0 of 1" and an empty most-missed panel; the
// cohort-analytics fixture is 3 of 20 with the IOP step on top. That divergence is what
// makes this a real assertion and not a tautology. AdminCohort pins discipline "all", so
// the switcher sitting on OT above does not move these numbers.
if ((await tp.locator('[data-testid="stat-card"]:has(.aurora-statcard-label:text-is("Avg OSCE"))').count()) !== 0) {
  console.error("FAIL: the retired 'Avg OSCE' KPI (derived from the 80-item activity feed) is still rendered"); process.exit(1);
}
if ((await tp.locator('.aurora-panel-head:text-is("Weakest topics (cohort)")').count()) !== 0) {
  console.error("FAIL: the retired 'Weakest topics (cohort)' panel is still rendered — it ranks cohort_summary counts against the new weakness_score ranking"); process.exit(1);
}
const safetyText = (await tp.locator('.aurora-panel:has(.aurora-panel-head:text-is("OSCE safety-failure rate"))').innerText()).replace(/\s+/g, " ");
if (!safetyText.includes("3 of 20 graded attempt(s) missed a critical safety step")) {
  console.error(`FAIL: the safety donut still reads the activity feed, not cohortAnalyticsView.safetyPanel over cohort-analytics (panel text: '${safetyText}')`); process.exit(1);
}
const missedText = (await tp.locator('.aurora-panel:has(.aurora-panel-head:text-is("Most-missed OSCE steps"))').innerText()).replace(/\s+/g, " ");
if (!missedText.includes("Checked intraocular pressure before dilation")) {
  console.error(`FAIL: most-missed bars are not reading cohort-analytics missed_top (panel text: '${missedText}')`); process.exit(1);
}
// missedPanel's own summary carries the per-group denominator ("4 of 9 students who
// attempted …"); the caption adds the cohort-wide one, so neither figure is a bare count.
if (!missedText.includes("4 of 9 students who attempted Intraocular Pressure")) {
  console.error(`FAIL: most-missed panel dropped its per-group student denominator (panel text: '${missedText}')`); process.exit(1);
}
if (!missedText.includes("15 students have station data")) {
  console.error(`FAIL: most-missed panel is missing its cohort-wide student denominator (panel text: '${missedText}')`); process.exit(1);
}
console.log("PASS: Admin — feed-derived cohort panels retired; safety + most-missed read /api/admin/cohort-analytics");

// P1's core invariant, re-pinned for this panel: a FAILED read must never render as a
// measurement. On a 500 the panel shows its error affordance and the in-scope count
// degrades to a dash — "0 students in scope" beside a broken endpoint reads as a real,
// measured, empty cohort, which is the defect class this whole phase exists to kill.
// (tp is not used after this block, so leaving the route broken is safe.)
const caPanel = tp.locator('section.aurora-panel:has([data-testid="cohort-discipline-caption"])');
await trainerCtx.route("**/api/admin/cohort-analytics*", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Operation failed. Please try again." }) }));
await tp.locator('[data-testid="cohort-discipline"] button[data-discipline="oa_psa"]').click();
await caPanel.locator(".aurora-panel-error").waitFor({ state: "visible", timeout: 15000 });
const scopeText = (await caPanel.locator("span.aurora-unavail").first().innerText()).trim();
if (/^\d/.test(scopeText)) { console.error(`FAIL: a failed cohort-analytics read rendered a number ('${scopeText}') instead of a no-data marker`); process.exit(1); }
if ((await caPanel.locator('[data-testid="cohort-topics-summary"]').count()) !== 0) { console.error("FAIL: the topic summary survived a failed cohort-analytics read"); process.exit(1); }
console.log("PASS: Admin — a failed cohort-analytics read renders as an error, never as a zero measurement");

// an admin gets the same board PLUS the Accounts tab.
const adminUser = { full_name: "Site Admin", email: "admin@snec.com.sg", student_id: "A001", role: "admin", student_role: "", must_change: false };
const adminCtx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await adminCtx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_checkin_date", new Date().toLocaleDateString("en-CA"));
  localStorage.setItem("eyebot_tour_seen", "true");
  localStorage.setItem("eyebot_rail_pinned", "1");
}, adminUser);
await adminCtx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
await staffMocks(adminCtx);
await adminCtx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(adminUser)));
const ap = await adminCtx.newPage();
await ap.goto(base + "/admin", { waitUntil: "domcontentloaded" });
await ap.waitForSelector('[data-testid="stat-card"]', { timeout: 15000 });
if ((await ap.locator('[role="tab"]:has-text("Accounts")').count()) !== 1) {
  console.error("FAIL: admin is missing the Accounts tab on /admin"); process.exit(1);
}
await ap.locator('[role="tab"]:has-text("Students")').click();
await ap.waitForSelector(".aurora-trow.is-clickable", { timeout: 8000 });
console.log("PASS: Admin — admin also gets the Accounts tab; the Students roster lists rows");

// regression: AdminStudentDetail seeds its editable note from useStudentDetail, which
// polls every 30s. The seeding effect must key off studentId (once per opened student),
// NOT `data` (every poll) — a background refetch resolving to a new object reference
// (session_count/last_active drift, even with the same note) must never clobber a
// supervisor's in-progress draft. Reproduced live pre-fix: type a draft, wait one real
// poll, draft gone. Proven here with a FAKE clock so the assertion stays fast — the
// clock must be installed BEFORE the query mounts (a timer scheduled via the real
// setTimeout pre-install is never advanced by a later fastForward).
let detailFetches = 0;
// Flipped after the populated assertions to prove the panel is OMITTED, not zero-filled,
// when the API sends no block. admin.py emits `mastery: null` for a student outside the
// staff-free cohort (a promoted trainer is on the roster and clickable) as well as on a
// failed read — so this is a routine state, not an error path.
let masteryNull = false;
await adminCtx.route("**/api/admin/student/*/detail", (r) => {
  detailFetches++;
  r.fulfill(JSON_OK({
    student_id: "S001", full_name: "Test Student", email: "student@snec.com.sg", role: "OA",
    session_count: 18 + detailFetches, streak: 6, last_active: new Date(Date.now() + detailFetches).toISOString(),
    learning_velocity: "improving", weak_topics: [], missed_findings: [], retention_scores: {},
    supervisor_note: detailFetches === 1 ? "Original supervisor note" : "SERVER NOTE FROM POLL — must never clobber a draft",
    sessions: [], cases: [], total_tokens: 1000 + detailFetches,
    // Imported, not a second literal — see the MASTERY comment in _mocks.mjs for what each
    // row encodes. `masteryNull` below flips this to the off-cohort state.
    mastery: masteryNull ? null : MASTERY,
  }));
});
await ap.clock.install();
await ap.locator(".aurora-trow.is-clickable").first().click();
const noteBox = ap.locator(".aurora-modal textarea.aurora-checkin-textarea");
await noteBox.waitFor({ state: "visible", timeout: 8000 });
await ap.waitForFunction(() => {
  const ta = document.querySelector(".aurora-modal textarea.aurora-checkin-textarea");
  return ta && ta.value === "Original supervisor note";
}, null, { timeout: 8000 });
const draft = "DRAFT — do not lose me";
await noteBox.fill(draft);
await ap.clock.fastForward(31_000); // past staleTime (15s) and the 30s poll
await ap.waitForTimeout(500); // let the mocked round-trip + re-render settle (real time)
if (detailFetches < 2) { console.error(`FAIL: test setup never triggered a second /detail fetch (fetches=${detailFetches}) — assertion is not meaningful`); process.exit(1); }
const survived = await noteBox.inputValue();
if (survived !== draft) { console.error(`FAIL: supervisor-note draft was clobbered by a background poll refetch (got "${survived}")`); process.exit(1); }
console.log(`PASS: Admin — student-note draft survives a background poll refetch (${detailFetches} detail fetches observed)`);

// P2b §6.2: the drill-down compares the student to a LEAVE-ONE-OUT cohort on three named
// scales. This replaces `cohort_retention`, a per-topic field the frontend read from
// 2026-07-14 and no backend version ever sent — so the report's "vs cohort" column
// printed a column of dashes for the seventeen days it existed.
// The modal opened above is still on screen; the fixture is the same one that fetch served.
// Wait FIRST: locator.count() does not auto-wait, and a count taken before the panel
// renders reads 0 and hard-fails CI on correct code.
await ap.waitForSelector('[data-testid="mastery-row"]', { timeout: 15000 });
if ((await ap.locator('[data-testid="mastery-row"]').count()) !== 3) {
  console.error("FAIL: expected 3 named mastery scales"); process.exit(1);
}
const osceDelta = await ap.locator('[data-testid="mastery-row"][data-scale="osce_mastery"] [data-testid="mastery-delta"]').textContent();
if (osceDelta?.trim() !== "+17") {
  console.error(`FAIL: mastery delta vs cohort = ${osceDelta}, expected +17`); process.exit(1);
}
const fcValue = await ap.locator('[data-testid="mastery-row"][data-scale="flashcard_mastery"] [data-testid="mastery-value"]').textContent();
if (fcValue?.trim() !== "—") {
  console.error(`FAIL: a scale with no student data must render an em dash, not ${fcValue}`); process.exit(1);
}
const retCohort = await ap.locator('[data-testid="mastery-row"][data-scale="retention_mastery"] [data-testid="mastery-cohort"]').textContent();
if (!retCohort?.includes("No cohort")) {
  console.error(`FAIL: a solo cohort must say so, not render a zero delta (got ${retCohort})`); process.exit(1);
}
// peers_n, not cohort_n. cohort_n is 8 here and counts this student; the average is over 7.
// "8 peers" beside a mean of 7 students is the exact misread peers_n was added to prevent.
const osceCohort = await ap.locator('[data-testid="mastery-row"][data-scale="osce_mastery"] [data-testid="mastery-cohort"]').textContent();
if (!osceCohort?.includes("7 peer")) {
  console.error(`FAIL: the cohort caption must name peers_n (7), not cohort_n (8) — got ${osceCohort}`); process.exit(1);
}
console.log("PASS: Admin — mastery vs a leave-one-out cohort renders three named scales, dashes for no data, and the peer count");

// The block must VANISH when the API sends none — not render three dashed rows, which
// would read as "measured, and this student scored nothing". `mastery: null` is routine:
// admin.py emits it for any student outside the staff-free cohort, and a promoted trainer
// is on the roster and clickable. Only the pure masteryRows(null) case was covered; the
// JSX guard that hides the section was not, so dropping it passed every gate.
// Assert on the PANEL, not the rows: with the `mastery.length > 0` guard removed the
// section still renders its heading and help text with an empty list, so a row count of
// zero passes while a trainer is looking at a "Mastery vs cohort" panel that measures
// nothing. The section's own absence is the property worth pinning.
masteryNull = true;
await ap.clock.fastForward(31_000);
await ap.waitForFunction(
  () => !document.querySelector('[data-testid="mastery-panel"]'),
  null, { timeout: 8000 },
);
// ...and only that section goes. The note box is the rest of the modal still standing.
if (!(await noteBox.isVisible())) {
  console.error("FAIL: a null mastery block took the whole drill-down with it"); process.exit(1);
}
console.log("PASS: Admin — a null mastery block omits the panel and leaves the rest of the drill-down intact");
await ap.close();

// a student must never reach the cohort-wide staff surface.
const spg = await navCtx.newPage();
await spg.goto(base + "/admin", { waitUntil: "domcontentloaded" });
await spg.waitForFunction(() => location.pathname !== "/admin", null, { timeout: 8000 }).catch(() => null);
if (new URL(spg.url()).pathname === "/admin") { console.error("FAIL: AdminGuard let a student onto /admin (cohort data leak)"); process.exit(1); }
if ((await spg.locator('[data-testid="stat-card"]').count()) > 0) { console.error("FAIL: student saw cohort stat cards on /admin"); process.exit(1); }
console.log("PASS: Admin — a student is bounced off the staff surface");
await spg.close();

// regression (prod incident 2026-06-27): a pre-MCQ deck ({front,back}, NO `options`)
// rehydrated from the offline cache must NOT reach McqCard — its options.map() would
// white-screen the page. The orchestrator filters malformed cards, degrading to the
// graceful empty state instead of the error boundary.
const staleCtx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await staleCtx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_checkin_date", new Date().toLocaleDateString("en-CA"));
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
// Cards are pointer-events:none; the pick is resolved at the stage. The frozen (reduced-
// motion) fan is parked with Mixed centred, so a tap at the fan centre starts Mixed.
const stFan = await stp.locator(".fan-stage").boundingBox();
await stp.mouse.click(Math.round(stFan.x + stFan.width / 2), Math.round(stFan.y + stFan.height / 2));
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
await np.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
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
