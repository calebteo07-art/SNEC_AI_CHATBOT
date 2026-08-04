import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const b = await chromium.launch();
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };

const user = { full_name: "Test Student", email: "student@snec.com.sg", student_id: "S001", role: "student", student_role: "OA", must_change: false };
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((u) => {
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
  try { indexedDB.deleteDatabase("eyebot"); } catch {}
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_checkin_date", new Date().toLocaleDateString("en-CA"));
  localStorage.setItem("eyebot_tour_seen", "true");
}, user);
await ctx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
const J = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

await ctx.route("**/api/**", (r) => r.fulfill(J({})));
await ctx.route("**/api/auth/me", (r) => r.fulfill(J(user)));
await ctx.route("**/api/cases/C001/station", (r) => r.fulfill(J({
  // The title is deliberately OBLIQUE, like the real ones ("The Bright Red Eye That Looked
  // Worse Than It Was"). A title that names its own diagnosis is a case-content bug, not
  // something the UI should mask.
  case: { case_id: "C001", title: "Routine pressure check follow-up", difficulty: "intermediate", topic: "Glaucoma", estimated_minutes: 12,
          patient: { name: "Mr Rajasekaran", age: 55, presenting_complaint: "Here for my 6-month glaucoma review.", face: "/patients/indian_male_middle.webp" } },
  checklist: {
    procedure_name: "Non-Contact Tonometry", source: "checklist", total_steps: 6, critical_count: 2,
    phases: [
      { phase: 1, name: "Preparation & Identification", steps: [
        { step_number: 1, action: "Identify patient — name + NRIC", critical: true, category: "patient_identification", notes: null },
        { step_number: 2, action: "Explain purpose & procedure", critical: false, category: "consent", notes: null } ] },
      { phase: 2, name: "Clinical Assessment", steps: [
        { step_number: 3, action: "Measure IOP — take ~3 readings, average", critical: true, category: "clinical_assessment", notes: "Repeat if >=24" },
        { step_number: 4, action: "Measure distance visual acuity", critical: false, category: "clinical_assessment", notes: null } ] },
      { phase: 3, name: "Documentation & Follow-up", steps: [
        { step_number: 5, action: "Record readings in EMR", critical: false, category: "documentation", notes: null },
        { step_number: 6, action: "Advise on follow-up", critical: false, category: "patient_education", notes: null } ] },
    ],
  },
  examination_actions: [
    { key: "s1", label: "Identify patient", reveal_text: "", satisfies_steps: [1], mode: "do", prompt_text: "", phase: 1, critical: true, step_number: 1, kind: "verbal" },
    { key: "s2", label: "Explain procedure", reveal_text: "", satisfies_steps: [2], mode: "do", prompt_text: "", phase: 1, critical: false, step_number: 2, kind: "verbal" },
    { key: "s3", label: "Measure IOP", reveal_text: "IOP (NCT) · avg of 3 → R 18 mmHg · L 20 mmHg", satisfies_steps: [3], mode: "do", prompt_text: "", phase: 2, critical: true, step_number: 3, kind: "manual" },
    { key: "s4", label: "Test distance VA", reveal_text: "Distance VA → R 6/9 · L 6/12", satisfies_steps: [4], mode: "do", prompt_text: "", phase: 2, critical: false, step_number: 4, kind: "manual" },
    { key: "s5", label: "Document results", reveal_text: "", satisfies_steps: [5], mode: "do", prompt_text: "", phase: 3, critical: false, step_number: 5, kind: "manual", quick: true },
    { key: "s6", label: "Advise on follow-up", reveal_text: "", satisfies_steps: [6], mode: "do", prompt_text: "", phase: 3, critical: false, step_number: 6, kind: "verbal" },
  ],
})));
// The examiner ticks the next VERBAL step on each pass (3-5 are manual/action-panel only).
// Progressive, because the read-only checklist means /observe is now the only way steps 1-2
// can advance — clicking rows is gone (2026-07-29).
const VERBAL_ORDER = [1, 2, 6];
await ctx.route("**/api/cases/C001/observe", async (r) => {
  const body = JSON.parse(r.request().postData() || "{}");
  const ticked = new Set(body.already_ticked || []);
  const next = VERBAL_ORDER.find((n) => !ticked.has(n));
  await r.fulfill(J({ newly_satisfied: next === undefined ? [] : [next] }));
});
await ctx.route("**/api/cases/C001/chat", (r) => r.fulfill({
  status: 200, contentType: "text/event-stream",
  body: 'data: {"text":"Good morning, "}\n\ndata: {"text":"doctor."}\n\ndata: [DONE]\n\n',
}));
await ctx.route("**/api/cases/C001/submit", (r) => r.fulfill(J({
  result: {
    history_score: 8, investigations_score: 7, diagnosis_score: 9, management_score: 6,
    history_feedback: "Thorough.", investigations_feedback: "Good.", diagnosis_feedback: "Correct.", management_feedback: "Reasonable.",
    total_score: 31, overall_feedback: "Strong consult.", critical_hit: 2, critical_total: 2,
    score_100: 78, verdict: "Solid",
    consult_technique: 38, consult_technique_max: 50,
    judgement_safety: 40, judgement_safety_max: 50,
    safe: true, missed_critical: [],
    breakdown: {
      consult: { parts: [{ label: "History-taking", pts: 8, max: 10 }, { label: "Examination technique", pts: 7, max: 10 }], total: 38, max: 50, capped: false, cap_reason: "" },
      judgement: { parts: [{ label: "Recognition", pts: 9, max: 10 }, { label: "Handover & escalation", pts: 6, max: 10 }], total: 40, max: 50, capped: false, cap_reason: "" },
    },
  },
  cards: [], mock_mode: false,
  coaching: {
    highlights: ["Confirmed identity & consent early", "Clean NCT technique"],
    did_wrong: ["Only took one IOP reading", "Skipped the allergy check"],
    missed: ["Did not advise the follow-up interval"],
    focus: "Always record a baseline acuity first.",
  },
  checklist_comparison: [], per_phase: [],
})));
await ctx.route("**/api/cases/C001/action", (r) => r.fulfill(J({
  verdict: "partial",
  covered: ["Explains the procedure to the patient before starting"],
  missing: ["Takes 3 readings per eye and records the average"],
  model_answer: "Explains the procedure to the patient before starting · Takes 3 readings per eye and records the average",
  coaching: "Good coverage so far. To match the model answer, also take 3 readings per eye and record the average.",
})));
// C002 — a case with NO manual actions (all verbal) → EyeBot pane must collapse away.
await ctx.route("**/api/cases/C002/station", (r) => r.fulfill(J({
  case: { case_id: "C002", title: "Diet screening", difficulty: "beginner", topic: "Counselling", estimated_minutes: 8,
          patient: { name: "Mdm Lim", age: 68, presenting_complaint: "Here for a pre-clinic diet screen." } },
  checklist: {
    procedure_name: "Pre-clinic screening", source: "checklist", total_steps: 2, critical_count: 0,
    phases: [
      { phase: 1, name: "Preparation & Identification", steps: [
        { step_number: 1, action: "Identify patient — name + NRIC", critical: false, category: "patient_identification", notes: null } ] },
      { phase: 2, name: "Clinical Assessment", steps: [
        { step_number: 2, action: "Screen for special diet", critical: false, category: "history", notes: null } ] },
    ],
  },
  examination_actions: [
    { key: "s1", label: "Identify patient", reveal_text: "", satisfies_steps: [1], mode: "do", prompt_text: "", phase: 1, critical: false, step_number: 1, kind: "verbal" },
    { key: "s2", label: "Screen for special diet", reveal_text: "", satisfies_steps: [2], mode: "say", prompt_text: "Do you follow any special diet?", phase: 2, critical: false, step_number: 2, kind: "verbal" },
  ],
})));

// C003 — a DUAL-SOURCE step. Step 2 is one critical checklist row that names TWO sources
// ("verify with the medical record/EMR AND ask the patient"), so it is in `also_ask_steps`:
// the chip is only the chart half. It used to tick on one click, and the patient composer was locked
// while it was the gate, so the asking half was impossible. The examiner mock credits the
// asking ONLY after the client declares record_done — mirroring the backend's note.
await ctx.route("**/api/cases/C003/station", (r) => r.fulfill(J({
  case: { case_id: "C003", title: "Drops before the scan", difficulty: "beginner", topic: "eye_drops", estimated_minutes: 10,
          patient: { name: "Mdm Chua", age: 66, presenting_complaint: "Here for my drops before the scan." } },
  checklist: {
    procedure_name: "Instillation of Eye Drops", source: "checklist", total_steps: 3, critical_count: 1,
    phases: [
      { phase: 1, name: "Preparation & Identification", steps: [
        { step_number: 1, action: "Identify patient — name + NRIC", critical: false, category: "patient_identification", notes: null } ] },
      { phase: 2, name: "Clinical Assessment", steps: [
        { step_number: 2, action: "Check that the patient is not allergic to the selected eye drops by verifying with the patient’s medical record/EMR and by asking the patient.", critical: true, category: "medication", notes: null },
        { step_number: 3, action: "Instil one drop into the lower fornix", critical: false, category: "medication", notes: null } ] },
    ],
  },
  examination_actions: [
    { key: "s1", label: "Identify patient", reveal_text: "", satisfies_steps: [1], mode: "do", prompt_text: "", phase: 1, critical: false, step_number: 1, kind: "verbal" },
    { key: "s2", label: "Check allergy", reveal_text: "No drug allergy recorded on file.", satisfies_steps: [2], mode: "do", prompt_text: "", phase: 2, critical: true, step_number: 2, kind: "manual", quick: true, also_ask_steps: [2], dual_kind: "ask" },
    { key: "s3", label: "Instill drops", reveal_text: "", satisfies_steps: [3], mode: "do", prompt_text: "", phase: 2, critical: false, step_number: 3, kind: "manual" },
  ],
})));
let c003RecordDone = [];
await ctx.route("**/api/cases/C003/observe", async (r) => {
  const body = JSON.parse(r.request().postData() || "{}");
  const ticked = new Set(body.already_ticked || []);
  c003RecordDone = body.record_done || [];
  // The examiner judges the ASKING from the transcript; record_done only excuses the half it
  // cannot see. Exam-panel markers are not the student asking the patient — excluding them is
  // what makes this prove the order instead of passing on the chip click alone.
  const asked = (body.messages || []).some(
    (m) => m.role === "user" && /allerg/i.test(m.content) && !m.content.startsWith("[Examination performed"),
  );
  const out = [];
  if (!ticked.has(1)) out.push(1);
  else if (!ticked.has(2) && c003RecordDone.includes(2) && asked) out.push(2);
  await r.fulfill(J({ newly_satisfied: out }));
});
await ctx.route("**/api/cases/C003/chat", (r) => r.fulfill({
  status: 200, contentType: "text/event-stream",
  body: 'data: {"text":"No, "}\n\ndata: {"text":"no allergy that I know."}\n\ndata: [DONE]\n\n',
}));

// C004 — the SAME dual step reached in the other order: the student asks the patient first,
// and this examiner credits the step from the transcript ALONE (no record_done). That is the
// realistic over-credit case, and the only thing standing between it and a critical step
// ticking with the chart never opened is the client-side hold in lib/dualStep.admit.
await ctx.route("**/api/cases/C004/station", (r) => r.fulfill(J({
  case: { case_id: "C004", title: "Drops before the scan", difficulty: "beginner", topic: "eye_drops", estimated_minutes: 10,
          patient: { name: "Mdm Chua", age: 66, presenting_complaint: "Here for my drops before the scan." } },
  checklist: {
    procedure_name: "Instillation of Eye Drops", source: "checklist", total_steps: 2, critical_count: 1,
    phases: [
      { phase: 2, name: "Clinical Assessment", steps: [
        { step_number: 1, action: "Check that the patient is not allergic to the selected eye drops by verifying with the patient’s medical record/EMR and by asking the patient.", critical: true, category: "medication", notes: null },
        { step_number: 2, action: "Instil one drop into the lower fornix", critical: false, category: "medication", notes: null } ] },
    ],
  },
  examination_actions: [
    { key: "s1", label: "Check allergy", reveal_text: "Allergy recorded: Phenylephrine eye drops.", satisfies_steps: [1], mode: "do", prompt_text: "", phase: 2, critical: true, step_number: 1, kind: "manual", quick: true, also_ask_steps: [1], dual_kind: "ask" },
    { key: "s2", label: "Instill drops", reveal_text: "", satisfies_steps: [2], mode: "do", prompt_text: "", phase: 2, critical: false, step_number: 2, kind: "manual" },
  ],
})));
await ctx.route("**/api/cases/C004/observe", async (r) => {
  const body = JSON.parse(r.request().postData() || "{}");
  const asked = (body.messages || []).some(
    (m) => m.role === "user" && /allerg/i.test(m.content) && !m.content.startsWith("[Examination performed"),
  );
  await r.fulfill(J({ newly_satisfied: asked ? [1] : [] }));
});
await ctx.route("**/api/cases/C004/chat", (r) => r.fulfill({
  status: 200, contentType: "text/event-stream",
  body: 'data: {"text":"I am allergic "}\n\ndata: {"text":"to one drop, I think."}\n\ndata: [DONE]\n\n',
}));

// C005 — the OTHER dual kind, and the one that needs the per-STEP model. "Perform hand
// hygiene and confirm the patient's identity…" (Amsler #1, Ishihara #1, critical) ticked on
// the hygiene click alone. Two things differ from the allergy row and both are asserted
// below: the panel half is an ASSESSED technique (quick: false — the half is recorded when
// the typed technique is confirmed, not on the click), and hand hygiene RECURS at step 3
// from the SAME merged chip, where it must still tick on its own.
await ctx.route("**/api/cases/C005/station", (r) => r.fulfill(J({
  case: { case_id: "C005", title: "Amsler at the macula clinic", difficulty: "beginner", topic: "amsler", estimated_minutes: 10,
          patient: { name: "Mr Tan", age: 71, presenting_complaint: "My lines look bent." } },
  checklist: {
    procedure_name: "Amsler Grid Testing", source: "checklist", total_steps: 3, critical_count: 1,
    phases: [
      { phase: 1, name: "Preparation & Identification", steps: [
        { step_number: 1, action: "Perform hand hygiene and confirm the patient's identity (name and NRIC/date of birth) and the indication for Amsler testing.", critical: true, category: "infection_control", notes: null } ] },
      { phase: 2, name: "Clinical Assessment", steps: [
        { step_number: 2, action: "Test one eye at a time with the patient fixating on the central dot.", critical: false, category: "procedure", notes: null },
        { step_number: 3, action: "Perform hand hygiene after touching the patient.", critical: false, category: "infection_control", notes: null } ] },
    ],
  },
  examination_actions: [
    { key: "s1", label: "Hand hygiene", reveal_text: "", satisfies_steps: [1, 3], mode: "do", prompt_text: "", phase: 1, critical: true, step_number: 1, kind: "manual", quick: false, also_ask_steps: [1], dual_kind: "identity" },
    { key: "s2", label: "Amsler grid", reveal_text: "Left eye: wavy lines near the centre.", satisfies_steps: [2], mode: "do", prompt_text: "", phase: 2, critical: false, step_number: 2, kind: "manual" },
  ],
})));
// This examiner credits the identity confirmation from the transcript alone — the realistic
// over-credit case. Only the client-side hold keeps step 1 from ticking before the hygiene
// technique is typed.
await ctx.route("**/api/cases/C005/observe", async (r) => {
  const body = JSON.parse(r.request().postData() || "{}");
  const ticked = new Set(body.already_ticked || []);
  const identified = (body.messages || []).some(
    (m) => m.role === "user" && /nric|name/i.test(m.content) && !m.content.startsWith("[Examination performed"),
  );
  await r.fulfill(J({ newly_satisfied: identified && !ticked.has(1) ? [1] : [] }));
});
await ctx.route("**/api/cases/C005/chat", (r) => r.fulfill({
  status: 200, contentType: "text/event-stream",
  body: 'data: {"text":"Tan Ah Kow, "}\n\ndata: {"text":"S1234567D."}\n\ndata: [DONE]\n\n',
}));
await ctx.route("**/api/cases/C005/action", (r) => r.fulfill(J({ verdict: "good", covered: [], missing: [], model_answer: "" })));

const errs = [];
const p = await ctx.newPage();
p.on("pageerror", (e) => errs.push(String(e?.message ?? e).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error" && !/webpack-hmr|WebSocket/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });

await p.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });

// 0. The pre-flight briefing. It plays on EVERY station open (no storage key), advances
//    itself, and leaves in one action. Everything after this needs the scrim gone.
await p.waitForSelector('[data-testid="station-briefing"]', { timeout: 8000 });
const firstBeat = await p.locator('[data-testid="station-briefing"]').getAttribute("data-beat");
if (firstBeat !== "checklist") die(`briefing must open on the checklist beat, got "${firstBeat}"`);

// It auto-advances with no input at all — that is the cinematic behaviour, so prove it
// rather than trusting the timer. BEAT_MS is 5200; 7000 is one beat plus slack.
await p.waitForFunction(
  () => document.querySelector('[data-testid="station-briefing"]')?.getAttribute("data-beat") !== "checklist",
  { timeout: 7000 },
).catch(() => die("briefing must advance itself without a click"));
ok("briefing opens on the checklist beat and auto-advances");

/* Wait for the new beat's spotlight to RESOLVE, not merely for the beat to flip.
   StationBriefing clears `anchorEl` on every beat and re-resolves the target through
   `waitForElement([beat.target], 4000)`. When that pane is already mounted the promise
   settles in a microtask and the spot never blinks out — probing every frame on a warm
   local server measured zero absent-windows, which is why this passed here indefinitely.
   When the pane is NOT yet mounted (cold dynamic route, loaded runner) waitForElement
   polls, `anchorEl` stays null for as long as that takes, `{spot && …}` renders nothing,
   and the scrim falls back to `sbrief--center`. So `.sbrief-spot` can be legitimately
   absent for up to 4s after the flip — CI landed in exactly that window and
   `getComputedStyle(null)` took the whole sweep down with it. 8s clears waitForElement's
   own 4s budget. Fails rather than skips if it still never arrives: a centred card IS the
   component's designed degrade path, but this fixture always renders the anchor, so a
   missing spotlight here is a real defect — and a skip would read as a pass. */
await p.waitForSelector(".sbrief-spot", { timeout: 8000 })
  .catch(() => die("the beat after checklist never resolved a spotlight anchor"));

// The stage must actually be dark, and the spotlit pane must actually be lit. Both broke
// once already: tour.css loads AFTER aurora.css, so an equal-specificity .sbrief-spot lost
// to .tour-spot and reverted to the lighter tour dim; and a background on the scrim sits
// over the spotlight HOLE, dimming the pane it is meant to ignite. Measured, not eyeballed.
// Returns null rather than throwing if either node is missing: an uncaught TypeError here
// kills `start-harness.sh all` outright, so every harness after this one silently never runs.
const stage = await p.evaluate(() => {
  const spot = document.querySelector(".sbrief-spot");
  const scrim = document.querySelector(".sbrief");
  if (!spot || !scrim) return null;
  const alpha = (s) => Number((/rgba?\([\d\s,.]*?([\d.]+)\)/.exec(s) || [])[1] ?? (/rgb\(/.test(s) ? 1 : 0));
  return {
    dim: alpha(getComputedStyle(spot).boxShadow),
    scrimBg: getComputedStyle(scrim).backgroundColor,
  };
});
if (!stage) die("the briefing stage vanished before it could be measured (.sbrief-spot/.sbrief missing)");
if (!(stage.dim >= 0.75)) die(`the briefing stage must go dark (spot dim alpha ${stage.dim}, want >= 0.75)`);
if (!/rgba\(0, 0, 0, 0\)|transparent/.test(stage.scrimBg)) {
  die(`an anchored briefing scrim must be transparent or it dims the spotlit pane, got "${stage.scrimBg}"`);
}
ok(`briefing stage dims to ${stage.dim} with the spotlit pane left lit`);

// Hovering the card pauses it: the rail stops and the beat holds. Without this an
// auto-advancing dialog is unusable for a slow reader (WCAG 2.2.2).
await p.locator(".sbrief-card").hover();
if ((await p.locator('[data-testid="station-briefing"]').getAttribute("data-running")) !== "false") {
  die("hovering the briefing card must pause the auto-advance");
}
const held = await p.locator('[data-testid="station-briefing"]').getAttribute("data-beat");
await p.waitForTimeout(3400);
if ((await p.locator('[data-testid="station-briefing"]').getAttribute("data-beat")) !== held) {
  die("a hovered briefing must not advance");
}
ok("hovering the briefing pauses the auto-advance");

// Skip leaves in one click, from any beat.
await p.locator('[data-testid="briefing-skip"]').click();
await p.waitForTimeout(200);
if (await p.locator('[data-testid="station-briefing"]').count()) die("Skip must dismiss the briefing");
ok("Skip dismisses the briefing in one click");

// 0b. EVERY session (user, 2026-07-29). The briefing used to set eyebot_station_coach_seen
//     and never return. A reload keeps localStorage, so if any "seen" gate creeps back this
//     is what catches it — the whole point of the change lives in this assertion.
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });
await p.waitForSelector('[data-testid="station-briefing"]', { timeout: 8000 })
  .catch(() => die("the briefing must replay on EVERY station open — no seen-flag may gate it"));
ok("the briefing replays on a second station open (no seen-flag)");

// 0c. The card must never cover the pane it is pointing at. The station's panes are
//     full-height columns, so "below" and "above" both miss and the card used to clamp
//     straight over the spotlight — beat 2 hid the patient's name and turn badge. Hover
//     first so the walk is deterministic rather than racing the auto-advance.
await p.locator(".sbrief-card").hover();
for (let i = 0; i < 4; i++) {
  const beat = await p.locator('[data-testid="station-briefing"]').getAttribute("data-beat");
  await p.waitForTimeout(350);
  const box = await p.evaluate(() => {
    const c = document.querySelector(".sbrief-card")?.getBoundingClientRect();
    const s = document.querySelector(".sbrief-spot")?.getBoundingClientRect();
    if (!c || !s) return null;
    const overlap = Math.max(0, Math.min(c.right, s.right) - Math.max(c.left, s.left))
                  * Math.max(0, Math.min(c.bottom, s.bottom) - Math.max(c.top, s.top));
    return { overlap, card: { w: c.width, h: c.height, top: c.top, left: c.left }, vw: innerWidth, vh: innerHeight };
  });
  if (!box) die(`beat "${beat}" lost its card or spotlight`);
  if (box.overlap > 0) die(`beat "${beat}": the card overlaps its own spotlight by ${Math.round(box.overlap)}px²`);
  if (box.card.top < 0 || box.card.left < 0
      || box.card.top + box.card.h > box.vh || box.card.left + box.card.w > box.vw) {
    die(`beat "${beat}": card is off-screen at ${JSON.stringify(box.card)}`);
  }
  if (i < 3) { await p.locator('[data-testid="briefing-next"]').click(); await p.waitForTimeout(400); }
}
ok("every beat's card stays on-screen and clear of its own spotlight");

await p.locator('[data-testid="briefing-skip"]').click();
await p.waitForTimeout(200);

// 1. exactly one h1
if ((await p.locator("main h1, h1").count()) !== 1) die("station must render exactly one h1");
ok("one h1");

// 2. phase rail shows all three phases
const railCount = await p.locator(".aurora-station-rl").count();
if (railCount !== 3) die(`phase rail should show 3 phases, got ${railCount}`);
ok("phase rail renders three phases");

// 3. checklist label shows live progress out of the real step total.
const label = (await p.locator(".aurora-station-cl-label").first().innerText()).toLowerCase();
if (!label.includes("checklist") || !label.includes("6")) die(`checklist label wrong: "${label}"`);
ok("checklist label shows progress out of total steps");

// 4. each of the 6 steps renders as its own clean, tickable row (no merging).
const steps = await p.locator(".aurora-station-step").count();
if (steps !== 6) die(`expected 6 one-per-step checklist rows, got ${steps}`);
ok("six steps render as six discrete rows");

// 4a. Every step still has its OWN row — nothing dropped or merged. Their action text is
//     progressively revealed (see 5i), so presence is asserted by row count + display
//     state, not by reading the words: at load exactly one row is current and the rest
//     are masked.
if ((await p.locator('.aurora-station-step[data-display="current"]').count()) !== 1) die("exactly one row must be current at load");
if ((await p.locator('.aurora-station-step[data-display="masked"]').count()) !== 5) die("the other five rows must be masked at load");
if (!(await p.locator('.aurora-station-step[data-display="masked"] .mask').first().count())) die("a masked row must render the mask glyph run");
ok("six discrete rows: one current, five masked");

// 4b. independent scroll: the station root must fill the scroll viewport so the
//     checklist + consult panes scroll inside their own bounds — not the whole
//     page scrolling as one. This holds only when the height:100% chain from
//     .aurora-main-scroll down to .aurora-station is unbroken.
const pane = await p.evaluate(() => {
  const station = document.querySelector(".aurora-station");
  const scroll = document.querySelector(".aurora-main-scroll");
  const cl = document.querySelector(".aurora-station-clscroll");
  const thread = document.querySelector(".aurora-station-thread");
  const oy = (el) => (el ? getComputedStyle(el).overflowY : "");
  return {
    stationH: station?.clientHeight ?? 0,
    scrollH: scroll?.clientHeight ?? 0,
    clOverflow: oy(cl),
    threadOverflow: oy(thread),
  };
});
if (Math.abs(pane.stationH - pane.scrollH) > 2) die(`station not bounded to viewport (height:100% chain broken): station=${pane.stationH}px scroll=${pane.scrollH}px`);
if (pane.clOverflow !== "auto" || pane.threadOverflow !== "auto") die(`scroll panes must be overflow-y:auto, got checklist=${pane.clOverflow} thread=${pane.threadOverflow}`);
ok("checklist + consult scroll independently (station bounded to viewport)");

// 5. the palette renders ONLY manual-procedure chips; verbal steps stay in the chat
if (await p.locator('.aurora-pchip:has-text("Identify patient")').count()) die("verbal step must NOT be a palette chip");
if (await p.locator('.aurora-pchip:has-text("Explain procedure")').count()) die("verbal 'Explain procedure' must NOT be a palette chip");
if (!(await p.locator('.aurora-pchip:has-text("Measure IOP")').count())) die("palette missing the Measure IOP manual chip");
ok("palette shows manual procedures only (verbal steps stay in chat)");

// 5p. the split: a warm patient pane + a cool EyeBot pane; manual chips live in EyeBot only.
if (!(await p.locator('[data-testid="patient-pane"]').count())) die("missing the patient chat pane");
if (!(await p.locator('[data-testid="eyebot-pane"]').count())) die("missing the EyeBot action pane");
if (await p.locator('[data-testid="patient-pane"] .aurora-pchip').count()) die("manual chips must NOT be in the patient pane");
if (!(await p.locator('[data-testid="eyebot-pane"] .aurora-pchip:has-text("Measure IOP")').count())) die("Measure IOP chip must live in the EyeBot pane");
ok("two distinct panes; manual chips live in the EyeBot pane only");

// 5q. ricoe §8: the conversation pane shows the patient's demographic archetype FACE
//     (an img, ricoe §8), the action pane keeps its static hand SVG (ricoe C9). The
//     face falls back to the talking-head SVG when absent — verified on C002 below.
const faceSrc = await p.getAttribute('[data-testid="patient-pane"] .aurora-pane-face img', "src");
if (!faceSrc || !faceSrc.includes("/patients/")) die(`patient pane must show the archetype face, src=${faceSrc}`);
if (!(await p.locator('[data-testid="eyebot-pane"] .aurora-pane-dot svg').count())) die("action pane missing its static hand pfp");
ok("patient face pfp (img) + static hand on the action pane (ricoe §8)");

// 5g. Gating: at load nothing is ticked → gate is step 1. Later steps + their chips
//     must be locked, and the in-order help caption present.
if (!(await p.locator('.aurora-station-cl-help:has-text("tick themselves")').count())) die("missing the auto-tick help caption");
if (!(await p.locator('.aurora-pchip[data-locked="true"]:has-text("Measure IOP")').count())) die("Measure IOP chip must be locked before its turn");
if (await p.locator('.aurora-pchip:has-text("Measure IOP")').first().isEnabled()) die("locked Measure IOP chip must be disabled");
const lockedRows = await p.locator('.aurora-station-step[data-locked="true"]').count();
if (lockedRows < 4) die(`expected later rows locked at load, got ${lockedRows}`);
if (!(await p.locator('.aurora-station-step[data-current="true"]:has-text("Identify patient")').count())) die("step 1 must be the current step at load");
ok("gating: later steps + chips locked, step 1 current, help caption present");

// 5h. The checklist is READ-ONLY (2026-07-29): rows are not buttons and clicking one does
//     nothing. This is a state invariant — students were ticking rows instead of doing the
//     work, so the affordance must never come back.
const firstRow = p.locator('.aurora-station-step').first();
if ((await firstRow.evaluate((el) => el.tagName)) !== "LI") die("checklist rows must not be buttons");
const beforeClick = await p.locator('.aurora-station-step[data-ticked="true"]').count();
await firstRow.click({ force: true });
await p.waitForTimeout(150);
if ((await p.locator('.aurora-station-step[data-ticked="true"]').count()) !== beforeClick) {
  die("clicking a checklist row must not tick it");
}
ok("checklist is read-only — clicking a row does nothing");

// 5i. Progressive reveal: future steps are masked, and their action text is NOWHERE in the
//     DOM. Branda's point — a fully-visible list is a script students read off instead of
//     recalling their own history-taking questions.
if (!(await p.locator('.aurora-station-step[data-display="masked"]').count())) die("future steps must be masked");
const clText = await p.locator(".aurora-station-clscroll").innerText();
if (clText.includes("Advise on follow-up")) die("a future step's action text leaked into the DOM");
if (!clText.includes("Identify patient")) die("the current step must still be named");
ok("future steps masked, current step named");

// 5j. Talking advances the gate — the only path now for verbal steps.
await p.locator(".aurora-station-composer-input").fill("Good morning, can I confirm your name and NRIC?");
await p.locator(".aurora-station-composer-send").click();
await p.waitForFunction(() => document.querySelector(".aurora-station-thread")?.textContent?.includes("Good morning, doctor."), null, { timeout: 8000 });
await p.waitForSelector('.aurora-station-step[data-current="true"]:has-text("Explain purpose")', { timeout: 8000 });
await p.locator(".aurora-station-composer-input").fill("I'll explain what the test involves before we start.");
await p.locator(".aurora-station-composer-send").click();
await p.waitForSelector('.aurora-station-step[data-current="true"]:has-text("Measure IOP")', { timeout: 8000 });
if (await p.locator('.aurora-pchip[data-locked="true"]:has-text("Measure IOP")').count()) die("Measure IOP must unlock once steps 1-2 are done");
ok("consult advances the gate in order and unlocks the next chip");

// 5m. The patient chat LOCKS while the next step is a hands-on procedure (gate is now the
//     manual Measure IOP) — the student must use the action panel, not chat.
if (!(await p.locator('[data-testid="patient-lock"]').count())) die("patient chat must lock when the next step is manual");
if (await p.locator('[data-testid="patient-pane"] .aurora-station-composer-input').count()) die("patient composer must be hidden while a manual step is the gate");
ok("patient chat locks on manual steps (composer hidden — action panel only)");

// 5n. Turn-spotlight: the grid names the live pane, and the badge names the CHANNEL only.
const turnNow = await p.getAttribute(".aurora-station-grid", "data-turn");
if (turnNow !== "eyebot") die(`data-turn should be "eyebot" on a manual gate step, got "${turnNow}"`);
const badge = await p.locator('[data-testid="turn-badge"]').innerText();
// Case-insensitive: the badge is rendered uppercase via text-transform, and the invariant
// is that it NAMES the pane — its casing is a styling decision, not a contract.
if (!/eyebot/i.test(badge)) die(`turn badge must name the pane, got "${badge}"`);
if (/\d/.test(badge)) die(`turn badge must not leak a step number: "${badge}"`);
// waitForFunction, not a bare read: data-turn has just flipped, so opacity is mid-TRANSITION
// and getComputedStyle returns the interpolating value (starting at 1). Asserting the settled
// state is the real invariant; a one-shot read here fails on a working spotlight.
// Threshold tracks the INTENSIFIED treatment (opacity .5) — a regression back to a polite
// .72 should fail here, because "students can't tell where to act" was the whole complaint.
await p.waitForFunction(
  () => Number(getComputedStyle(document.querySelector(".aurora-patient")).opacity) <= 0.55,
  null,
  { timeout: 4000 },
).catch(() => die("inactive pane never dimmed hard enough"));
// ...and the live pane must actually carry the accent ring, not just be undimmed.
const ring = await p.evaluate(() => getComputedStyle(document.querySelector(".aurora-eyebot")).boxShadow);
if (!/rgba?\(\s*44,\s*107,\s*224/.test(ring)) die(`live pane missing its accent ring: ${ring.slice(0, 120)}`);
ok("turn-spotlight: data-turn set, badge names the channel, inactive pane dimmed");

// 5o. The case TOPIC must not appear in the station's METADATA — on many cases it IS the
//     diagnosis (case_oa_009 → topic "subconjunctival_haemorrhage"), and it used to print in
//     both the HUD and the aside before a single question was asked. Scoped to those two
//     places on purpose: the patient saying "I'm here for my glaucoma review" is their own
//     words, not a metadata leak, and must stay.
const hudText = await p.locator(".aurora-station-hud").innerText();
const asideMeta = await p.locator(".aurora-station-mt").innerText();
if (/glaucoma/i.test(hudText)) die(`case topic leaked into the station HUD: "${hudText}"`);
if (/glaucoma/i.test(asideMeta)) die(`case topic leaked into the aside: "${asideMeta}"`);
if (!/tonometry/i.test(hudText)) die(`HUD should name the procedure instead of the topic, got "${hudText}"`);
ok("case topic absent from the station chrome (procedure shown instead)");

// 5t. The case clock renders and counts down from the case's own estimated_minutes (12) —
//     and it is IMPOSSIBLE to miss. It used to be a 15px word wedged into the metadata row
//     between the procedure and the tier, where students never saw it; it now owns a
//     labelled header pill. The size floor is the guard against it quietly shrinking back.
const clock = await p.locator('[data-testid="station-clock"]').innerText();
if (!/^\d+:\d{2}$/.test(clock.trim())) die(`case clock should read m:ss, got "${clock}"`);
if (Number(clock.split(":")[0]) > 12) die(`clock should count DOWN from 12 min, got "${clock}"`);
const clockPx = await p.locator('[data-testid="station-clock"]').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
if (clockPx < 28) die(`case clock must be prominent (>=28px), got ${clockPx}px`);
if (!(await p.locator('.aurora-station-clockpill:has-text("Time left")').count())) die("clock must be labelled 'Time left'");
if (await p.locator('.aurora-station-hud [data-testid="station-clock"]').count()) die("clock must not be buried back in the metadata row");
ok("case clock counts down from the case estimate in a prominent header pill");

// 5p2. "?" help opens, is labelled, and closes.
await p.locator('[data-testid="help-station"]').click();
await p.waitForSelector('[data-testid="help-modal"]', { timeout: 4000 });
const helpText = await p.locator('[data-testid="help-modal"]').innerText();
if (!/tick/i.test(helpText)) die("station help must explain that the checklist ticks itself");
// User, 2026-07-29: "too long winded and no one is gonna read all that". It was ~330 words
// across seven sections. The ceiling is the fix — prose is what grows back.
const helpWords = helpText.trim().split(/\s+/).length;
if (helpWords > 90) die(`"?" help is ${helpWords} words — it is a document again, not a glance`);
if ((await p.locator('[data-testid="help-modal"] .aurora-help-list > div').count()) !== 4) {
  die('"?" help must be exactly four lines');
}
ok(`'?' help is a ${helpWords}-word glance, explains the checklist`);

// Replay is the card's real job: it hands the student back to the briefing.
await p.locator('[data-testid="help-replay"]').click();
await p.waitForSelector('[data-testid="station-briefing"]', { timeout: 4000 })
  .catch(() => die('"Replay the walkthrough" must re-open the briefing'));
if (await p.locator('[data-testid="help-modal"]').count()) die("replaying must close the help card");
await p.locator('[data-testid="briefing-skip"]').click();
await p.waitForTimeout(200);
ok("'?' replays the briefing");

// And it still closes on Escape.
await p.locator('[data-testid="help-station"]').click();
await p.waitForSelector('[data-testid="help-modal"]', { timeout: 4000 });
await p.keyboard.press("Escape");
await p.waitForTimeout(150);
if (await p.locator('[data-testid="help-modal"]').count()) die("Escape must close the help modal");
ok("'?' help closes on Escape");

// 5a. clicking a manual chip opens procedure mode → typing technique + confirm logs
//     the technique, reveals the finding, ticks the step, and marks the chip done.
await p.locator('.aurora-pchip:has-text("Measure IOP")').click();
await p.waitForSelector(".aurora-station-proc", { timeout: 5000 });
await p.locator(".aurora-station-proc-input").fill("Seat patient at the tonometer, ask them to look straight ahead and not blink, take three readings and average.");
await p.locator(".aurora-station-proc-go").click();
await p.waitForSelector(".aurora-station-reveal", { timeout: 5000 });
if (!(await p.locator('.aurora-station-reveal:has-text("18 mmHg")').count())) die("reveal missing IOP result");
if (!(await p.locator('.aurora-station-reveal:has-text("Seat patient")').count())) die("reveal missing the typed technique");
if (!(await p.locator('.aurora-pchip[data-done="true"]:has-text("Measure IOP")').count())) die("chip did not become done after confirm");
if ((await p.locator('.aurora-station-step[data-ticked="true"]').count()) < 1) die("confirm did not tick the step row");
ok("manual chip → procedure mode → confirm logs technique + result + ticks step");

// 5c. EyeBot returns a real-time GRADE vs the crafted model answer (ricoe C6): a verdict
//     card with covered/missing points + the model answer — not a hardcoded "good job".
await p.waitForSelector('[data-testid="action-grade"]', { timeout: 8000 });
if (!(await p.locator('.aurora-grade-badge:has-text("Partial")').count())) die("grade verdict badge missing");
if (!(await p.locator('.aurora-grade-model:has-text("Model answer")').count())) die("crafted model answer not surfaced");
if (!(await p.locator('.aurora-grade-list.is-missing').count())) die("missing model-answer points not shown");
ok("action panel grades the technique vs the model answer (ricoe C6)");

// 5d. A "quick" mechanical procedure ticks on ONE click — no procedure composer opens,
//     no typed explanation (ricoe C5). First advance the gate to it (finish step 4).
await p.locator('.aurora-pchip:has-text("Test distance VA")').click();
await p.waitForSelector(".aurora-station-proc", { timeout: 5000 });
await p.locator(".aurora-station-proc-input").fill("Occlude one eye at 6m, use the LogMAR chart, record the lowest line read correctly.");
await p.locator(".aurora-station-proc-go").click();
await p.waitForSelector('.aurora-pchip[data-done="true"]:has-text("Test distance VA")', { timeout: 5000 });
if (!(await p.locator('.aurora-pchip[data-quick="true"]:has-text("Document results")').count())) die("Document results must render as a quick chip");
await p.locator('.aurora-pchip[data-quick="true"]:has-text("Document results")').click();
if (await p.locator(".aurora-station-proc").count()) die("quick chip must NOT open the procedure composer");
await p.waitForSelector('.aurora-pchip[data-done="true"]:has-text("Document results")', { timeout: 5000 });
ok("quick procedure ticks on one click — no typed explanation (ricoe C5)");

// 5r. Regression (2026-07-29): the reveal cards are `overflow: hidden`, which zeroes a flex
//     item's automatic minimum size — so inside the flex-column thread they were SQUASHED to
//     a sliver the moment the thread overflowed, clipping "Examination performed · …"
//     mid-glyph. Nothing in a scrolling thread may shrink. Measured at a SHORT viewport on
//     purpose: a roomy one never overflows and would report a false green.
await p.setViewportSize({ width: 1440, height: 620 });
await p.waitForTimeout(300);
const squash = await p.evaluate(() => {
  const thread = document.querySelector(".aurora-eyebot-thread");
  if (!thread) return { missing: true };
  return {
    overflowing: thread.scrollHeight > thread.clientHeight + 1,
    clipped: [...thread.children]
      .filter((el) => el.scrollHeight > el.clientHeight + 1)
      .map((el) => `${el.className} (${el.clientHeight}px of ${el.scrollHeight}px)`),
  };
});
if (squash.missing) die("EyeBot thread not found");
if (!squash.overflowing) die("thread must overflow at 620px height, else this check is a false green");
if (squash.clipped.length) die(`thread children clipped their own content: ${squash.clipped.join(" | ")}`);
await p.setViewportSize({ width: 1440, height: 900 });
await p.waitForTimeout(200);
ok("reveal cards never squash/clip in the scrolling thread");

// 6. sending a message streams a patient reply
await p.locator(".aurora-station-composer-input").fill("Good morning, can I confirm your name and NRIC?");
await p.locator(".aurora-station-composer-send").click();
await p.waitForFunction(() => document.querySelector(".aurora-station-thread")?.textContent?.includes("Good morning, doctor."), null, { timeout: 8000 });
ok("patient consult streams a reply");

// 7. submit → the handover + debrief pop up in an OVERLAY (out of the chat thread).
await p.locator('.aurora-station-submit-toggle').click();
await p.waitForSelector(".aurora-station-overlay-card", { timeout: 5000 });
if (await p.locator('.aurora-station-thread .aurora-station-form').count()) die("handover form must be in the overlay, not the chat thread");
if (!(await p.locator('.aurora-station-overlay-card label:has-text("Findings")').count())) die("handover must show the relabelled 'Findings' field");
if (!(await p.locator('.aurora-station-overlay-card label:has-text("Next steps")').count())) die("handover must show the relabelled 'Next steps' field");
await p.locator('.aurora-station-overlay-card textarea[data-field="findings"]').fill("Stable IOP on repeat readings; no red flags. Routine review.");
await p.locator('.aurora-station-overlay-card textarea[data-field="recommendation"]').fill("Route as routine; document readings; advise to return if vision changes.");
await p.locator('.aurora-station-overlay-card .aurora-station-submit-go').click();
await p.waitForSelector(".aurora-station-overlay-card .aurora-station-result", { timeout: 10000 });
if (!(await p.locator('.aurora-s100-score:has-text("/100")').count())) die("result must show score out of 100");
if (!(await p.locator('.aurora-s100-verdict:has-text("Solid")').count())) die("result must show the verdict");
if ((await p.locator(".aurora-s100-comp").count()) !== 2) die("result must show 2 component cards (checklist dropped)");
if (await p.locator('.aurora-s100-comp:has-text("OSCE checklist")').count()) die("checklist must NOT be a scored component card");
if (!(await p.locator('.aurora-s100-comp:has-text("Consultation & Technique")').count())) die("missing the Consultation & Technique scheme card");
if (!(await p.locator('.aurora-s100-comp:has-text("Clinical Judgement & Safety")').count())) die("missing the Clinical Judgement & Safety scheme card");
if (!(await p.locator('.aurora-s100-safety.is-safe').count())) die("result must show the safety badge");
if (!(await p.locator('[data-testid="ai-summary"]').count())) die("result must show the point-form AI summary");
if (!(await p.locator('.aurora-s100-col.is-good li').count())) die("result must list what you did well");
if (!(await p.locator('.aurora-s100-col.is-watch li').count())) die("result must list what was done wrong/partially");
if (!(await p.locator('.aurora-s100-col.is-miss li').count())) die("result must list what was missed/lacking");
ok("debrief: 2 scheme cards /50, safety badge, point-form AI summary (wrong + missed)");

// 7d. The debrief explains itself: the arithmetic behind each scheme plus the grader's own
//     per-domain words, which the API has always sent and the UI used to throw away.
if ((await p.locator('[data-testid="score-maths"]').count()) !== 2) die("both schemes must show their sub-scores");
const maths = await p.locator('[data-testid="score-maths"]').first().innerText();
if (!/\d+\/10/.test(maths)) die(`score maths must show sub-scores out of 10, got "${maths}"`);
const debriefText = await p.locator(".aurora-station-result").innerText();
if (!debriefText.includes("Thorough.")) die("per-domain feedback (history) not rendered");
if (!debriefText.includes("Reasonable.")) die("per-domain feedback (management) not rendered");
ok("debrief shows the scoring rationale + per-domain feedback");

// 7e. The topic was hidden all station; the debrief is where it is finally safe to name.
if (!/glaucoma/i.test(debriefText)) die("the debrief should finally name the topic");
ok("topic revealed in the debrief");

// 7a. One-time session save: the button downloads the record, then is spent (disabled, and
//     visibly says so). The spent LABEL is asserted as "it changed", not as exact copy —
//     pinning the literal word "saved" rotted the moment the CTA became "⬇ Download session
//     insights" / "✓ Insights downloaded" (54831c7) while the behaviour stayed correct. The
//     download itself is now asserted: the old `.catch(() => null)` + bare `await` swallowed
//     a timeout, so a save that silently stopped downloading would still have passed.
const saveBtn = p.locator('[data-testid="save-session"]');
if (!(await saveBtn.count())) die("result must show the one-time save button");
if (await saveBtn.isDisabled()) die("save button must be enabled before the first save");
const labelBefore = (await saveBtn.innerText()).trim();
// 20s, not 8s: the blob download is sub-second in isolation but measured ~9.2s this late in a
// long browser session, so 8s made a REAL download look absent. A timeout that can expire on a
// working feature is why this was written to swallow its result in the first place.
const dl = p.waitForEvent("download", { timeout: 20000 }).catch(() => null);
await saveBtn.click();
if (!(await dl)) die("save button must actually download the session record");
if (!(await saveBtn.isDisabled())) die("save button must be disabled after saving (one-time only)");
const labelAfter = (await saveBtn.innerText()).trim();
if (labelAfter === labelBefore) die(`save button must show a spent state once used — label still reads "${labelAfter}"`);
ok("one-time session save downloads once, then the button is spent");

// 7b. a case with NO manual actions renders the patient chat only — no EyeBot pane.
await p.goto(base + "/cases/C002", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });
if (await p.locator('[data-testid="eyebot-pane"]').count()) die("no-manual case must NOT render the EyeBot pane");
if (!(await p.locator('[data-testid="patient-pane"]').count())) die("patient pane must still render in the no-manual case");
ok("no manual actions → EyeBot pane collapses (patient chat only)");

// 7c. ricoe §8: C002's patient has NO face → the pfp gracefully falls back to the
//     static talking-head SVG (nothing depends on the face asset existing).
if (await p.locator('[data-testid="patient-pane"] .aurora-pane-face img').count()) die("no-face case must not render a face img");
if (!(await p.locator('[data-testid="patient-pane"] .aurora-pane-face svg').count())) die("no-face patient pane must fall back to the talking-head SVG");
ok("patient pfp falls back to the talking-head SVG when no face (graceful)");

// 7d. DUAL-SOURCE step (C003). One critical checklist row naming TWO sources needs BOTH:
//     the chart half at the chip, the asking half in the consult. The reported bug was one
//     click ticking it while revealing nothing — and the composer being locked out of the
//     half it needed. Every hop is asserted, in the click-first order.
await p.goto(base + "/cases/C003", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });
await p.locator('[data-testid="briefing-skip"]').click();
// Talk once to clear the verbal step 1 so the dual step becomes the gate.
await p.locator(".aurora-station-composer-input").fill("Good morning, can I confirm your name and NRIC?");
await p.locator(".aurora-station-composer-send").click();
await p.waitForSelector('.aurora-station-step[data-current="true"]:has-text("not allergic")', { timeout: 8000 });

// The regression that made the step impossible: a manual chip's step used to lock the
// composer. A dual step must leave BOTH panes live.
if (await p.locator('[data-testid="patient-lock"]').count()) die("a dual-source step must NOT lock the patient chat — asking is half of it");
if (!(await p.locator('[data-testid="patient-pane"] .aurora-station-composer-input').count())) die("patient composer must stay available on a dual-source step");
const dualTurn = await p.getAttribute(".aurora-station-grid", "data-turn");
if (dualTurn !== "patient") die(`dual-source gate should keep the patient turn, got "${dualTurn}"`);
ok("dual-source step keeps the patient composer live (both halves reachable)");

// Click the chip: it must REVEAL the record and NOT tick the step.
await p.locator('.aurora-pchip:has-text("Check allergy")').click();
await p.waitForSelector('[data-testid="dual-hint"]', { timeout: 8000 });
const revealText = await p.locator(".aurora-station-reveal").last().innerText();
if (!revealText.includes("No drug allergy recorded on file.")) die(`the chip must reveal the allergy record, got "${revealText}"`);
if (await p.locator('.aurora-station-step[data-ticked="true"]:has-text("not allergic")').count()) die("one click must NOT tick a step that also needs the patient asked");
const halfChip = p.locator('.aurora-pchip:has-text("Check allergy")');
if ((await halfChip.getAttribute("data-half")) !== "record") die("the chip must read half-done once the record is checked");
if (!(await halfChip.isDisabled())) die("a half-done chip must stop taking clicks (it would re-post the same reveal)");
const hint = await p.locator('[data-testid="dual-hint"]').innerText();
if (!/ask/i.test(hint)) die(`the hint must name the outstanding half, got "${hint}"`);
if (/\d/.test(hint)) die(`the hint must not leak a step number: "${hint}"`);
// The half state must SURVIVE the pane's chip override (.aurora-eyebot .aurora-pchip
// re-colours every chip blue). Assert the computed amber rather than trusting the cascade.
// waitForFunction, not a one-shot read: .aurora-pchip TRANSITIONS `background .2s`, so a
// read taken the instant data-half flips returns the interpolating value — which STARTS at
// the pane's blue and fails a working rule. Same trap as the spotlight opacity above.
await p.waitForFunction(
  () => /^rgba?\(245,\s*166,\s*35/.test(getComputedStyle(document.querySelector('.aurora-pchip[data-half="record"]')).backgroundColor),
  null,
  { timeout: 4000 },
).catch(async () => {
  const got = await p.evaluate(() => getComputedStyle(document.querySelector('.aurora-pchip[data-half="record"]')).backgroundColor);
  die(`half-done chip must settle on amber, not the pane's blue: ${got}`);
});
ok("chip reveals the record, marks itself half-done, and explains the missing half");

// Now ask the patient. The examiner credits the asking (it was sent record_done), so the
// step finally ticks — and the half-done affordance clears.
await p.locator(".aurora-station-composer-input").fill("Any allergies to eye drops that you know of?");
await p.locator(".aurora-station-composer-send").click();
await p.waitForSelector('.aurora-station-step[data-ticked="true"]:has-text("not allergic")', { timeout: 8000 });
if (!c003RecordDone.includes(2)) die(`the client must declare the chart half to the examiner, got record_done=${JSON.stringify(c003RecordDone)}`);
if (await p.locator('[data-testid="dual-hint"]').count()) die("the hint must clear once both halves are done");
if ((await halfChip.getAttribute("data-done")) !== "true") die("the chip must read done once both halves are in");
ok("record then patient → the critical step ticks");

// 7e. The OTHER order (C004): asked first, chart never opened. The examiner here credits the
//     step from the transcript alone, so the client-side hold is the only thing stopping a
//     critical step from ticking with the record unread. Without it this whole fix is
//     bypassable by simply talking first.
await p.goto(base + "/cases/C004", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });
await p.locator('[data-testid="briefing-skip"]').click();
await p.locator(".aurora-station-composer-input").fill("Do you have any allergies to eye drops?");
await p.locator(".aurora-station-composer-send").click();
// Wait for the examiner's credit to LAND — either as a tick (the regression) or as the
// half-done hint (correct). Waiting on the hint alone would report a broken hold as an
// opaque locator timeout instead of naming what went wrong.
await p.waitForFunction(
  () => !!document.querySelector('[data-testid="dual-hint"]')
     || !!document.querySelector('.aurora-station-step[data-ticked="true"]'),
  null,
  { timeout: 8000 },
).catch(() => die("the examiner's credit never landed: no tick and no half-done hint"));
if (await p.locator('.aurora-station-step[data-ticked="true"]:has-text("not allergic")').count()) die("asking alone must NOT tick a step that also needs the record checked");
const askChip = p.locator('.aurora-pchip:has-text("Check allergy")');
if ((await askChip.getAttribute("data-half")) !== "asked") die("the chip must show the asking is done and the record is not");
if (await askChip.isDisabled()) die("the chip must stay clickable — checking the record is the half still outstanding");
const askHint = await p.locator('[data-testid="dual-hint"]').innerText();
if (!/record|chart|EMR/i.test(askHint)) die(`the hint must name the record as outstanding, got "${askHint}"`);
// Now open the chart: the held credit is admitted and the step ticks on this click alone.
await askChip.click();
await p.waitForSelector('.aurora-station-step[data-ticked="true"]:has-text("not allergic")', { timeout: 8000 });
const askReveal = await p.locator(".aurora-station-reveal").last().innerText();
if (!askReveal.includes("Phenylephrine")) die(`the chip must still reveal the record it read, got "${askReveal}"`);
if (await p.locator('[data-testid="dual-hint"]').count()) die("the hint must clear once both halves are done");
ok("patient then record → the held credit is admitted and the step ticks");

// 7f. The OTHER dual KIND (C005): "perform hand hygiene AND confirm the patient's identity".
//     Two things here that the allergy row cannot test — the panel half is an ASSESSED
//     technique (so the half is recorded at confirm, not on the click), and the chip is
//     MERGED with an ordinary hygiene step that must still tick on its own. A per-CHIP flag
//     would strand that second step waiting for an identity confirmation nobody will say.
await p.goto(base + "/cases/C005", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });
await p.locator('[data-testid="briefing-skip"]').click();
// Ask for the identity first — this examiner credits it from the transcript alone.
await p.locator(".aurora-station-composer-input").fill("Good morning, may I have your name and NRIC please?");
await p.locator(".aurora-station-composer-send").click();
await p.waitForFunction(
  () => !!document.querySelector('[data-testid="dual-hint"]')
     || !!document.querySelector('.aurora-station-step[data-ticked="true"]'),
  null,
  { timeout: 8000 },
).catch(() => die("the examiner's credit never landed on the hygiene+identity step"));
if (await p.locator('.aurora-station-step[data-ticked="true"]:has-text("hand hygiene and confirm")').count()) die("confirming the identity alone must NOT tick a step that also needs the hygiene performed");
const idHint = await p.locator('[data-testid="dual-hint"]').innerText();
if (!/EyeBot|panel/i.test(idHint)) die(`the hint must send them to the panel, got "${idHint}"`);
if (/ask the patient/i.test(idHint)) die(`an identity step owes an identity check, not a question: "${idHint}"`);
ok("identity confirmed alone does not tick the fused hygiene step");
// Now do the hygiene in the panel. It is ASSESSED, so the chip opens the composer — and the
// step ticks only once the technique is confirmed.
const hygChip = p.locator('.aurora-pchip:has-text("Hand hygiene")');
await hygChip.click();
await p.waitForSelector(".aurora-station-proc", { timeout: 5000 });
if (await p.locator('.aurora-station-step[data-ticked="true"]:has-text("hand hygiene and confirm")').count()) die("opening the composer must not tick the step — the technique is the panel half");
await p.locator(".aurora-station-proc-input").fill("Alcohol hand rub, all surfaces including thumbs and wrists, twenty seconds before touching the patient.");
await p.locator(".aurora-station-proc-go").click();
await p.waitForSelector('.aurora-station-step[data-ticked="true"]:has-text("hand hygiene and confirm")', { timeout: 8000 });
if (await p.locator('[data-testid="dual-hint"]').count()) die("the hint must clear once both halves are done");
ok("typed hygiene technique + identity confirmed → the critical fused step ticks");
// The merged chip's ORDINARY occurrence (step 3) must still tick on its own — reached after
// the Amsler step, and it must not wait for a second identity confirmation.
await p.locator('.aurora-pchip:has-text("Amsler grid")').click();
await p.waitForSelector(".aurora-station-proc", { timeout: 5000 });
await p.locator(".aurora-station-proc-input").fill("One eye covered, reading correction on, patient fixates the central dot and reports any wavy or missing areas.");
await p.locator(".aurora-station-proc-go").click();
await p.waitForSelector('.aurora-station-step[data-ticked="true"]:has-text("central dot")', { timeout: 8000 });
await hygChip.click();
await p.waitForSelector(".aurora-station-proc", { timeout: 5000 });
await p.locator(".aurora-station-proc-input").fill("Alcohol hand rub again after touching the patient, all surfaces, twenty seconds.");
await p.locator(".aurora-station-proc-go").click();
// Named failure, not a bare locator timeout: making dual-ness per CHIP instead of per STEP
// strands exactly this step, and a raw TimeoutError does not say so.
await p.waitForSelector('.aurora-station-step[data-ticked="true"]:has-text("after touching")', { timeout: 8000 })
  .catch(() => die("the merged chip's ORDINARY hygiene step must tick on its own — per-CHIP dual-ness would strand it forever"));
if (await p.locator('[data-testid="dual-hint"]').count()) die("the ordinary hygiene step must not wait on a second identity confirmation");
ok("the same merged chip's ordinary step still ticks on its own");

// 8. mobile: no horizontal overflow at 390px
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(400);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 2) die(`horizontal overflow at 390px = ${overflow}px`);
ok("no horizontal overflow at 390px");

if (errs.length) die("page/console errors: " + JSON.stringify(errs.slice(0, 3)));
ok("station screen clean (no page/console errors)");
console.log("ALL STATION ASSERTIONS PASSED");
await b.close();
