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

const errs = [];
const p = await ctx.newPage();
p.on("pageerror", (e) => errs.push(String(e?.message ?? e).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error" && !/webpack-hmr|WebSocket/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });

await p.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });

// 0. The first-run coach-mark is up on a fresh profile — walk it, which also proves it
//    renders and completes. Everything after this needs the scrim gone.
await p.waitForSelector('[data-testid="station-coach"]', { timeout: 8000 });
for (let i = 0; i < 4 && (await p.locator('[data-testid="coach-next"]').count()); i++) {
  await p.locator('[data-testid="coach-next"]').click();
}
if (await p.locator('[data-testid="station-coach"]').count()) die("coach-mark did not dismiss");
ok("first-run coach-mark renders and completes");

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

// 5t. The case clock renders and counts down from the case's own estimated_minutes (12).
const clock = await p.locator('[data-testid="station-clock"]').innerText();
if (!/^\d+:\d{2}$/.test(clock.trim())) die(`case clock should read m:ss, got "${clock}"`);
if (Number(clock.split(":")[0]) > 12) die(`clock should count DOWN from 12 min, got "${clock}"`);
ok("case clock renders and counts down from the case estimate");

// 5p2. "?" help opens, is labelled, and closes.
await p.locator('[data-testid="help-station"]').click();
await p.waitForSelector('[data-testid="help-modal"]', { timeout: 4000 });
const helpText = await p.locator('[data-testid="help-modal"]').innerText();
if (!/tick/i.test(helpText)) die("station help must explain that the checklist ticks itself");
await p.keyboard.press("Escape");
await p.waitForTimeout(150);
if (await p.locator('[data-testid="help-modal"]').count()) die("Escape must close the help modal");
ok("'?' help opens, explains the checklist, closes on Escape");

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
