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
    { key: "iop", label: "Measure IOP · NCT", reveal_text: "IOP (NCT) · avg of 3 → R 18 mmHg · L 20 mmHg", satisfies_steps: [3] },
    { key: "va", label: "Measure distance VA", reveal_text: "Distance VA → R 6/9 · L 6/12", satisfies_steps: [4] },
  ],
})));
await ctx.route("**/api/cases/C001/observe", (r) => r.fulfill(J({ newly_satisfied: [1] })));
await ctx.route("**/api/cases/C001/chat", (r) => r.fulfill({
  status: 200, contentType: "text/event-stream",
  body: 'data: {"text":"Good morning, "}\n\ndata: {"text":"doctor."}\n\ndata: [DONE]\n\n',
}));
await ctx.route("**/api/cases/C001/submit", (r) => r.fulfill(J({
  result: { history_score: 8, investigations_score: 7, diagnosis_score: 9, management_score: 6,
            history_feedback: "Thorough history.", investigations_feedback: "Good IOP technique.",
            diagnosis_feedback: "Correct.", management_feedback: "Reasonable plan.",
            total_score: 30, overall_feedback: "Strong consult.", critical_hit: 2, critical_total: 2 },
  cards: [], mock_mode: false,
  debrief: "What you did really well: clear identification and clean NCT technique. Where to grow next time: document the follow-up interval in Phase 3.",
  checklist_comparison: [
    { step_number: 1, action: "Identify patient — name + NRIC", critical: true, performed: true, clinical_note: "Confirms right patient, right eye." },
    { step_number: 6, action: "Advise on follow-up", critical: false, performed: false, clinical_note: "Patients lapse without a clear return date." },
  ],
  per_phase: [ { phase: 1, name: "Preparation & Identification", done: 2, total: 2 },
               { phase: 2, name: "Clinical Assessment", done: 1, total: 2 },
               { phase: 3, name: "Documentation & Follow-up", done: 0, total: 2 } ],
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

// 3. auto-tracked checklist label + step count
const label = (await p.locator(".aurora-station-cl-label").first().innerText()).toLowerCase();
if (!label.includes("auto-tracked") || !label.includes("6")) die(`checklist label wrong: "${label}"`);
ok("checklist shows auto-tracked label with step count");

// 4. all 6 steps render
const steps = await p.locator(".aurora-station-step").count();
if (steps !== 6) die(`expected 6 checklist steps, got ${steps}`);
ok("six checklist steps render");

// 5. clicking an exam chip reveals the finding, marks its step, marks chip used
await p.locator('.aurora-station-act:has-text("Measure IOP")').click();
await p.waitForSelector(".aurora-station-reveal", { timeout: 5000 });
if (!(await p.locator('.aurora-station-reveal:has-text("18 mmHg")').count())) die("reveal card missing IOP value");
if (!(await p.locator('.aurora-station-act.is-used:has-text("Measure IOP")').count())) die("exam chip did not become used");
const tickedAfter = await p.locator('.aurora-station-step[data-ticked="true"]').count();
if (tickedAfter < 1) die("performing IOP did not tick its step");
ok("exam action reveals finding + ticks step + marks chip used");

// 6. sending a message streams a patient reply
await p.locator(".aurora-station-composer-input").fill("Good morning, can I confirm your name and NRIC?");
await p.locator(".aurora-station-composer-send").click();
await p.waitForFunction(() => document.querySelector(".aurora-station-thread")?.textContent?.includes("Good morning, doctor."), null, { timeout: 8000 });
ok("patient consult streams a reply");

// 7. submit → scored debrief with /40 + per-phase summary
await p.locator('.aurora-station-submit-toggle').click();
await p.locator('textarea[data-field="diagnosis"]').fill("Stable primary open-angle glaucoma.");
await p.locator('textarea[data-field="management"]').fill("Continue drops; review in 6 months.");
await p.locator('.aurora-station-submit-go').click();
await p.waitForSelector(".aurora-station-result", { timeout: 10000 });
if (!(await p.locator('.aurora-station-result:has-text("/40")').count())) die("result must show score out of 40");
if ((await p.locator(".aurora-station-phasechip").count()) !== 3) die("result must show a per-phase summary (3 chips)");
ok("submit shows scored debrief out of 40 with per-phase summary");

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
