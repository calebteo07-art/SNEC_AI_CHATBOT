/* Behavioral harness for the virtual-patient (OSCE station) quit-forfeit (ship-check verify).
   Drives the real station screen against a served standalone build with mocked APIs and
   asserts POST /api/cases/{id}/forfeit fires exactly once on every unfinished exit — and
   NOT at all when the student cancels the leave, or once the handover has been graded.

   Usage (server already warm — see /harness):
     node --experimental-strip-types frontend/tests/station_forfeit_assert.mjs http://127.0.0.1:3000

   Scenarios:
     1. ← Patients → confirm leave              ⇒ 1 forfeit   (controlled exit, in-progress)
     2. ← Patients → Stay in the station        ⇒ 0 forfeits  (cancel is free)
     3. Hard-nav away mid-station (pagehide)     ⇒ 1 forfeit   (uncontrolled exit → beacon)
     4. Submit the handover → leave              ⇒ 0 forfeits  (a graded station is free)
     5. Atlas Rail link mid-station → confirm    ⇒ 1 forfeit   (the reported loophole, sealed)
     6. Atlas Rail link mid-station → Stay       ⇒ 0 forfeits  (cancel is free)
     7. ⌘K palette mid-station → confirm         ⇒ 1 forfeit   (palette routes to the confirm too)
*/
import assert from "node:assert";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const b = await chromium.launch();

const user = { full_name: "Test Student", email: "student@snec.com.sg", student_id: "S001", role: "student", student_role: "OA", must_change: false };
const J = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

const STATION = {
  case: { case_id: "C001", title: "Routine glaucoma follow-up", difficulty: "intermediate", topic: "Glaucoma", estimated_minutes: 12,
          patient: { name: "Mr Rajasekaran", age: 55, presenting_complaint: "Here for my 6-month glaucoma review.", face: "/patients/indian_male_middle.webp" } },
  checklist: {
    procedure_name: "Non-Contact Tonometry", source: "checklist", total_steps: 2, critical_count: 1,
    phases: [
      { phase: 1, name: "Preparation & Identification", steps: [
        { step_number: 1, action: "Identify patient — name + NRIC", critical: true, category: "patient_identification", notes: null } ] },
      { phase: 2, name: "Clinical Assessment", steps: [
        { step_number: 2, action: "Measure distance visual acuity", critical: false, category: "clinical_assessment", notes: null } ] },
    ],
  },
  // All-verbal so the station loads with no locked manual gate in the way of leaving.
  examination_actions: [
    { key: "s1", label: "Identify patient", reveal_text: "", satisfies_steps: [1], mode: "do", prompt_text: "", phase: 1, critical: true, step_number: 1, kind: "verbal" },
    { key: "s2", label: "Check acuity", reveal_text: "", satisfies_steps: [2], mode: "say", prompt_text: "", phase: 2, critical: false, step_number: 2, kind: "verbal" },
  ],
};

const SUBMIT_RESULT = {
  result: {
    history_score: 8, investigations_score: 7, diagnosis_score: 9, management_score: 6,
    history_feedback: "", investigations_feedback: "", diagnosis_feedback: "", management_feedback: "",
    total_score: 31, critical_hit: 1, critical_total: 1,
    score_100: 78, verdict: "Solid",   // 40/30/30 — 30 + 22 + 26
    checklist_coverage: 30, checklist_coverage_max: 40,
    consult_technique: 22, consult_technique_max: 30, judgement_safety: 26, judgement_safety_max: 30,
    safe: true, missed_critical: [],
  },
  cards: [], mock_mode: false,
  coaching: { highlights: ["Confirmed identity early"], did_wrong: [], missed: [], focus: "Keep it up." },
  checklist_comparison: [], per_phase: [], lumens_awarded: 156,
};

async function makeCtx() {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((u) => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
    try { indexedDB.deleteDatabase("eyebot"); } catch {}
    localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
    localStorage.setItem("eyebot_checkin_date", new Date().toLocaleDateString("en-CA"));
    localStorage.setItem("eyebot_tour_seen", "true");
  }, user);
  await ctx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);

  // Count the charge IN THE PAGE, not from playwright's request stream.
  //
  // The charge is a navigator.sendBeacon fired from `pagehide`, i.e. while the document is
  // being torn down by the very navigation that triggered it. Playwright's own view of that
  // request is version-dependent, and measured on 2026-08-27 across chromium headless-shell,
  // new-headless and headed:
  //
  //     channel            playwright 1.60.0 / Chrome 148   playwright 1.62.1 / Chrome 151
  //     ctx.on("request")              1                                0
  //     ctx.route()                    0 (intercept kills it)           0 (not intercepted)
  //     ctx.exposeFunction()           1                                0
  //     localStorage in-page           1                                1
  //
  // Only the in-page counter survives both. Under 1.62.1 the beacon still REACHES the server
  // — a plain node server counted it in all three modes — playwright simply stops reporting
  // it, so ctx.on("request") turns a working product red. That false red is the whole reason
  // playwright had been pinned to an exact 1.60.0; counting here is what lifts the pin.
  //
  // This asserts "the app called sendBeacon once", which is what the scenarios mean by a
  // charge. The catch-all route below fulfils /api/** anyway, so no forfeit ever reached a
  // real endpoint even under 1.60.0 — the network was never the thing being measured.
  const KEY = "__pw_forfeit_beacons";
  await ctx.addInitScript((k) => {
    const orig = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (!orig) return;
    navigator.sendBeacon = (url, data) => {
      if (String(url).includes("/forfeit")) {
        try { localStorage.setItem(k, String(Number(localStorage.getItem(k) || 0) + 1)); } catch {}
      }
      return orig(url, data);
    };
  }, KEY);

  // Reads the live page, so it must be awaited. Survives navigation and reload (same origin),
  // which scenarios 3 and 3c depend on.
  const count = async () => {
    const page = ctx.pages().at(-1);
    if (!page) return 0;
    try { return Number(await page.evaluate((k) => localStorage.getItem(k) || 0, KEY)); }
    catch { return 0; }
  };

  await ctx.route("**/api/**", (r) => r.fulfill(J({})));
  await ctx.route("**/api/auth/me", (r) => r.fulfill(J(user)));
  await ctx.route("**/api/cases/C001/station", (r) => r.fulfill(J(STATION)));
  await ctx.route("**/api/cases/C001/observe", (r) => r.fulfill(J({ newly_satisfied: [] })));
  await ctx.route("**/api/cases/C001/chat", (r) => r.fulfill({
    status: 200, contentType: "text/event-stream",
    body: 'data: {"text":"Good morning."}\n\ndata: [DONE]\n\n',
  }));
  await ctx.route("**/api/cases/C001/submit", (r) => r.fulfill(J(SUBMIT_RESULT)));
  return { ctx, count };
}

// Enter the station and wait until the leave-guard has armed (station payload loaded ⇒ the
// submit toggle renders ⇒ the arming effect has run).
async function enterStation(ctx) {
  const page = await ctx.newPage();
  await page.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="station"]', { timeout: 20000 });
  await page.waitForSelector(".aurora-station-submit-toggle", { timeout: 20000 });
  await page.waitForTimeout(350); // let the setActive(true) effect arm the guard
  return page;
}

/* Wait until the in-page counter has seen `n` forfeit beacons.
 *
 * NOT page.waitForRequest, and no longer ctx.on("request") either — see makeCtx for why
 * playwright's request stream is not a dependable channel for a teardown-time beacon.
 * Scenario 7 (⌘K palette) is the original reason this poller exists: the beacon fired, the
 * app navigated correctly, and waitForRequest timed out anyway. CI was red for 28 hours on
 * a product that was working.
 *
 * The deeper bug was that the WAIT and the ASSERTION watched different channels, so they
 * could disagree — and when they did, the harness reported the app broken. Polling the
 * counter the assertion itself uses makes that disagreement impossible.
 *
 * It also removes a false-GREEN generator. `const seen = waitForfeit(page)` was created
 * before the click and awaited after, so any throw in between left it dangling; it later
 * rejected with nobody awaiting, which under node's default --unhandled-rejections=throw
 * killed the process instead of printing ✗. `start-harness.sh` runs under `set -e`, so
 * that aborted the whole suite and every harness after this one was silently skipped.
 * Nothing sleeps here that the app has not earned: the counter is monotonic from context
 * creation, so an already-delivered beacon returns on the first poll. */
const waitForfeit = async (count, n = 1, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while ((await count()) < n) {
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeout}ms waiting for ${n} forfeit beacon(s), saw ${await count()}`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
};

let failures = 0;
async function scenario(name, fn) {
  const { ctx, count } = await makeCtx();
  try {
    await fn(ctx, count);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  } finally {
    await ctx.close();
  }
}

console.log("station_forfeit_assert:");

// 1) The ← Patients button opens a confirm; confirming leaves and charges exactly one forfeit.
await scenario("← Patients → confirm charges exactly one forfeit", async (ctx, count) => {
  const page = await enterStation(ctx);
  await page.click('[data-testid="station-leave"]');
  await page.waitForSelector('[data-testid="station-leave-overlay"]', { timeout: 5000 });
  await page.click('[data-testid="station-leave-confirm"]');
  await waitForfeit(count);
  await page.waitForTimeout(400);
  assert.strictEqual(await count(), 1, `expected 1 forfeit on confirmed leave, saw ${await count()}`);
});

// 2) Cancelling the leave ("Stay in the station") is free — no forfeit, still on the station.
await scenario("← Patients → Stay charges zero forfeits", async (ctx, count) => {
  const page = await enterStation(ctx);
  await page.click('[data-testid="station-leave"]');
  await page.waitForSelector('[data-testid="station-leave-overlay"]', { timeout: 5000 });
  await page.click('[data-testid="station-leave-cancel"]');
  await page.waitForTimeout(500);
  assert.strictEqual(await count(), 0, `expected 0 forfeits on cancel, saw ${await count()}`);
  assert.ok(await page.locator('[data-testid="station"]').count(), "must still be on the station after cancel");
});

// 3) Uncontrolled exit: hard-navigate away mid-station ⇒ pagehide beacon forfeits once.
await scenario("Hard nav away mid-station charges one forfeit (pagehide beacon)", async (ctx, count) => {
  const page = await enterStation(ctx);
  await page.goto(base + "/homepage");
  await waitForfeit(count);
  await page.waitForTimeout(300);
  assert.strictEqual(await count(), 1, `expected 1 forfeit on hard nav, saw ${await count()}`);
});

// 3b) A RELOAD must give the station back, not destroy it. Everything lived in React state
//     and the backend holds no session, so a refresh — the single most ordinary thing a
//     student does when something looks stuck — silently ended a 20-minute encounter and
//     restarted it at step 1 with an empty transcript. There was no `beforeunload` anywhere
//     in the app to warn them, and the same pagehide fired the 30-Lumen charge.
await scenario("Reload mid-station restores the consultation", async (ctx, count) => {
  const page = await enterStation(ctx);
  // Say something, and wait for the patient's reply to land in the transcript.
  await page.fill(".aurora-station-composer-input", "Good morning, when did the pain start?");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.body.innerText.includes("Good morning."), null, { timeout: 10000 });

  page.on("dialog", (d) => d.accept());          // the new beforeunload warning
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="station"]', { timeout: 20000 });

  const text = await page.locator('[data-testid="station"]').innerText();
  assert.ok(text.includes("when did the pain start?"),
    "the student's own question must survive a reload");
  assert.ok(text.includes("Good morning."), "the patient's reply must survive a reload");
  assert.ok(await page.locator('[data-testid="station-resumed"]').count(),
    "the student must be TOLD their work was restored");
});

// 3c) The charge survives the reload as ONE charge. The dedupe flag lived in a per-mount
//     closure, so it could not see across a reload: refreshing mid-station charged 30, and
//     then quitting after the reload charged 30 AGAIN — N reloads cost N x 30 on a station
//     the student never abandoned.
await scenario("Reload then quit charges exactly one forfeit, not two", async (ctx, count) => {
  const page = await enterStation(ctx);
  page.on("dialog", (d) => d.accept());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="station"]', { timeout: 20000 });
  await page.waitForSelector(".aurora-station-submit-toggle", { timeout: 20000 });
  await page.waitForTimeout(350);

  await page.goto(base + "/homepage");           // now actually leave
  await waitForfeit(count);
  await page.waitForTimeout(500);
  assert.strictEqual(await count(), 1,
    `a reload + a quit is ONE abandoned station, saw ${await count()} charges`);
});

// 4) Fairness contract: submitting the handover grades the station ⇒ leaving is then free.
await scenario("Submit handover → leave charges zero forfeits", async (ctx, count) => {
  const page = await enterStation(ctx);
  await page.click(".aurora-station-submit-toggle");
  await page.waitForSelector(".aurora-station-overlay-card", { timeout: 5000 });
  await page.fill('.aurora-station-overlay-card textarea[data-field="findings"]', "Stable IOP on repeat; no red flags.");
  await page.fill('.aurora-station-overlay-card textarea[data-field="recommendation"]', "Route as routine; document; advise return if vision changes.");
  await page.click(".aurora-station-overlay-card .aurora-station-submit-go");
  await page.waitForSelector(".aurora-station-overlay-card .aurora-station-result", { timeout: 10000 });
  await page.goto(base + "/homepage"); // uncontrolled exit AFTER completion ⇒ still free
  await page.waitForTimeout(500);
  assert.strictEqual(await count(), 0, `expected 0 forfeits after completing, saw ${await count()}`);
});

// 5) THE REPORTED LOOPHOLE: the Atlas Rail sits on top of the station. Clicking a rail
//    destination mid-station must open the SAME forfeit confirm — not slip out for free.
//    The station isn't an immersive route, so the handle pins the rail fully open.
await scenario("Atlas Rail nav mid-station → confirm charges exactly one forfeit", async (ctx, count) => {
  const page = await enterStation(ctx);
  await page.click(".aurora-rail-handle");                        // pin the rail open
  await page.click('.aurora-navitem[aria-label="Homepage"]');     // try to leave via the sidebar
  await page.waitForSelector('[data-testid="station-leave-overlay"]', { timeout: 5000 });
  assert.strictEqual(await count(), 0, `no charge until confirmed, saw ${await count()}`);
  await page.click('[data-testid="station-leave-confirm"]');
  await waitForfeit(count);
  await page.waitForFunction(() => !location.pathname.startsWith("/cases/"), { timeout: 5000 });
  await page.waitForTimeout(300);
  assert.strictEqual(await count(), 1, `expected 1 forfeit after confirming rail leave, saw ${await count()}`);
});

// 6) Cancelling a rail-triggered leave is free and keeps you on the station.
await scenario("Atlas Rail nav mid-station → Stay charges zero forfeits", async (ctx, count) => {
  const page = await enterStation(ctx);
  await page.click(".aurora-rail-handle");
  await page.click('.aurora-navitem[aria-label="Homepage"]');
  await page.waitForSelector('[data-testid="station-leave-overlay"]', { timeout: 5000 });
  await page.click('[data-testid="station-leave-cancel"]');
  await page.waitForTimeout(500);
  assert.strictEqual(await count(), 0, `expected 0 forfeits on cancel, saw ${await count()}`);
  assert.ok(await page.locator('[data-testid="station"]').count(), "must still be on the station after cancel");
});

// 7) The ⌘K palette also sits on top of the station — a jump from it must confirm too.
await scenario("⌘K palette nav mid-station → confirm charges exactly one forfeit", async (ctx, count) => {
  const page = await enterStation(ctx);
  await page.keyboard.press("Control+k");
  await page.waitForSelector(".aurora-palette-input", { timeout: 6000 });
  await page.click("button.aurora-palette-item:has-text('Homepage')");
  await page.waitForSelector('[data-testid="station-leave-overlay"]', { timeout: 5000 });
  await page.click('[data-testid="station-leave-confirm"]');
  await waitForfeit(count);
  await page.waitForTimeout(300);
  assert.strictEqual(await count(), 1, `expected 1 forfeit after confirming palette leave, saw ${await count()}`);
});

await b.close();
if (failures) { console.error(`\nstation_forfeit_assert: ${failures} scenario(s) FAILED`); process.exit(1); }
console.log("\nstation_forfeit_assert: all scenarios passed");
