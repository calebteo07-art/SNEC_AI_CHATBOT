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
  sessionStorage.setItem("eyebot_checkin_session", "1");
  localStorage.setItem("eyebot_tour_seen", "true");
}, user);
await ctx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
const J = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

await ctx.route("**/api/**", (r) => r.fulfill(J({})));
await ctx.route("**/api/auth/me", (r) => r.fulfill(J(user)));
await ctx.route("**/api/cases/C001/station", (r) => r.fulfill(J({
  case: { case_id: "C001", title: "Routine glaucoma follow-up", difficulty: "intermediate", topic: "Glaucoma", estimated_minutes: 12,
          patient: { name: "Mr Rajasekaran", age: 55, presenting_complaint: "Here for my 6-month glaucoma review." } },
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
    { key: "s5", label: "Document results", reveal_text: "", satisfies_steps: [5], mode: "do", prompt_text: "", phase: 3, critical: false, step_number: 5, kind: "manual" },
    { key: "s6", label: "Advise on follow-up", reveal_text: "", satisfies_steps: [6], mode: "do", prompt_text: "", phase: 3, critical: false, step_number: 6, kind: "verbal" },
  ],
})));
await ctx.route("**/api/cases/C001/observe", (r) => r.fulfill(J({ newly_satisfied: [1] })));
await ctx.route("**/api/cases/C001/chat", (r) => r.fulfill({
  status: 200, contentType: "text/event-stream",
  body: 'data: {"text":"Good morning, "}\n\ndata: {"text":"doctor."}\n\ndata: [DONE]\n\n',
}));
await ctx.route("**/api/cases/C001/submit", (r) => r.fulfill(J({
  result: {
    history_score: 8, investigations_score: 7, diagnosis_score: 9, management_score: 6,
    history_feedback: "Thorough.", investigations_feedback: "Good.", diagnosis_feedback: "Correct.", management_feedback: "Reasonable.",
    total_score: 31, overall_feedback: "Strong consult.", critical_hit: 2, critical_total: 2,
    score_100: 78, verdict: "Solid", thoroughness: 31, technique: 24, judgment: 23,
    safe: true, missed_critical: [], thoroughness_detail: "5 of 6 steps · all 2 critical done",
  },
  cards: [], mock_mode: false,
  coaching: {
    highlights: ["Confirmed identity & consent early", "Clean NCT technique"],
    watch_outs: ["Document the follow-up interval", "Check VA before drops"],
    focus: "Always record a baseline acuity first.",
  },
  checklist_comparison: [], per_phase: [],
})));

const errs = [];
const p = await ctx.newPage();
p.on("pageerror", (e) => errs.push(String(e?.message ?? e).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error" && !/webpack-hmr|WebSocket/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });

await p.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });

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

// 4a. every original action is present — nothing dropped.
const checklistText = (await p.locator(".aurora-station-clscroll").innerText());
for (const action of [
  "Identify patient", "Explain purpose & procedure", "Measure IOP",
  "Measure distance visual acuity", "Record readings in EMR", "Advise on follow-up",
]) {
  if (!checklistText.includes(action)) die(`merge dropped a step action: "${action}"`);
}
ok("merged rows preserve every original step action");

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
if ((await p.locator(".aurora-s100-comp").count()) !== 3) die("result must show 3 component cards");
if (!(await p.locator('.aurora-s100-safety.is-safe').count())) die("result must show the safety badge");
if (!(await p.locator('.aurora-s100-col.is-good li').count())) die("result must list highlights");
if (!(await p.locator('.aurora-s100-col.is-watch li').count())) die("result must list watch-outs");
ok("handover + Station-100 debrief pop up in the overlay (Findings / Next steps)");

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
