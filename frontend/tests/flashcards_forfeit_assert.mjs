/* Behavioral harness for the flashcards quit-forfeit loophole (ship-check verify).
   Drives the real study screen against a served standalone build with mocked APIs and
   asserts POST /api/flashcards/forfeit fires exactly once on every unfinished exit — and
   NOT at all when a deck is completed.

   Usage (server already warm — see /harness):
     node --experimental-strip-types frontend/tests/flashcards_forfeit_assert.mjs http://127.0.0.1:3000

   Scenarios:
     1. Pause → Switch deck → confirm            ⇒ 1 forfeit   (the reported loophole)
     2. Pause → Quit → confirm                   ⇒ 1 forfeit   (existing path, still once)
     3. Answer the deck to completion → Home     ⇒ 0 forfeits  (finished round is free) --
        also pins the real POST /api/flashcards/complete wire payload (topic_tag + score)
     4. Hard-navigate away mid-round (pagehide)  ⇒ 1 forfeit   (uncontrolled exit → beacon)
     5. ⌘K palette → Homepage → confirm          ⇒ 1 forfeit   (in-app nav now routes to the confirm)
     6. ⌘K palette → Homepage → Keep playing      ⇒ 0 forfeits  (cancel is free, stays in the round)
*/
import assert from "node:assert";
import { chromium } from "playwright";
import { seededContext, student } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const b = await chromium.launch();

// A one-card free-text deck seeded via sessionStorage (loadSessionCards) so the page jumps
// straight into an active round — no need to drive the topic fan.
const SESSION = { cards: [{ front: "Normal IOP range?", back: "10–21 mmHg.", topic_tag: "iop_nct" }] };

async function makeCtx() {
  // reducedMotion collapses the study card's two chained JS timers — ChargeBeat's
  // BEAT_MS 1700ms and McqCard's SETTLE_MS 850ms — to 250ms + 850ms. Those 2.55s sat
  // under an 8s wait for ".flash-mark-got:not([disabled])" (scenario 3), i.e. barely 3x
  // headroom on timers Chromium is free to throttle on a page that isn't focused — and
  // this suite churns contexts, so pages lose focus constantly. Forfeit accounting is
  // motion-independent, so nothing under test changes; only the animation budget does.
  const ctx = await seededContext(b, base, student, undefined, { reducedMotion: "reduce" });
  await ctx.addInitScript((s) => {
    sessionStorage.setItem("eyebot_session", JSON.stringify(s));
  }, SESSION);
  // The shared mocks report the student as customized:true, so the mandatory first-login
  // gate never redirects off /flashcards (no local onboarding flag exists any more).
  let count = 0;
  // Captured here, asserted in the scenario (not inline): a route handler in _mocks.mjs
  // that throws is swallowed by Playwright as an unhandled rejection and the in-page
  // fetch just hangs — it does NOT fail this script. Asserting in the scenario instead
  // puts it on the awaited path, where scenario()'s try/catch actually observes a throw.
  let completeBody = null;
  ctx.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/flashcards/forfeit")) count += 1;
    if (req.method() === "POST" && req.url().includes("/api/flashcards/complete")) {
      try { completeBody = req.postDataJSON(); } catch { /* non-JSON body — leave null */ }
    }
  });
  return { ctx, count: () => count, completeBody: () => completeBody };
}

/* The round is LIVE — not merely "a node is visible". waitForSelector's default state can
   be satisfied by a stage that is on screen but not yet the active-round branch, and it
   reports failure as an unhelpful "to be visible" timeout. Assert the condition the guards
   actually bind to instead — the same reason aurora_assert.mjs reaches for waitForFunction
   over waitForSelector when "present" and "actually painted" can disagree (see its
   flash-option opacity gate, which a plain selector wait passed straight through).
   `flash-pause` renders ONLY on the active-round branch, so stage + pause together are the
   DOM proof that `inStudy` is true. */
const ROUND_LIVE = () => {
  const stage = document.querySelector("[data-testid=study-stage]");
  if (!stage) return false;
  const r = stage.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !!document.querySelector("[data-testid=flash-pause]");
};

const diagnose = (page) => page.evaluate(() => ({
  path: location.pathname,
  splash: !!document.querySelector("[data-testid=brand-splash]"),   // app chunk never loaded
  spinner: !!document.querySelector(".spinner"),                    // stuck in CheckInGuard
  root: !!document.querySelector(".flash-root"),
  stage: !!document.querySelector("[data-testid=study-stage]"),
  pause: !!document.querySelector("[data-testid=flash-pause]"),
  sess: !!sessionStorage.getItem("eyebot_session"),
  text: document.body.innerText.replace(/\s+/g, " ").slice(0, 140),
})).catch((e) => ({ evalError: String(e) }));

/* Booting the app is the harness's PRECONDITION, not the thing under test — and it has two
   known transient failure modes that a bare wait can neither survive nor explain:
     - a lost /_next chunk: every screen here is dynamic(ssr:false), which NEVER retries a
       rejected import, so one dropped request strands the page on BrandSplash forever;
     - the harness server going away mid-suite: if it dies after the HTML but before the
       chunks, goto() still resolves and this wait times out looking like a UI regression.
   Both poison exactly one scenario and clear on the next — which is why a different
   scenario failed each run. So: diagnose, prove nothing was charged, reload once, and say
   so loudly. No forfeit assertion is relaxed — `guard.spend()` returns false until a round
   is active, so a boot that never reached the stage cannot have charged anything, and we
   assert that rather than assume it. */
async function enterRound(ctx, count) {
  const page = await ctx.newPage();
  await page.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
  try {
    // NB the signature is (fn, arg, options) — passing options as `arg` silently falls back
    // to the 30s default, which is how a "20s" budget reported a 30s timeout.
    await page.waitForFunction(ROUND_LIVE, null, { timeout: 20000 });
  } catch (first) {
    const diag = await diagnose(page);
    const serverUp = await fetch(base + "/", { redirect: "manual" }).then(() => true).catch(() => false);
    if (!serverUp) {
      throw new Error(`the harness server stopped answering ${base} mid-run — every wait after `
        + `this is meaningless. Restart it: scripts/start-harness.sh stop && SKIP_BUILD=1 `
        + `scripts/start-harness.sh serve. DIAG ${JSON.stringify(diag)}`);
    }
    assert.strictEqual(count(), 0,
      `a forfeit was charged by a round that never started (saw ${count()}) — DIAG ${JSON.stringify(diag)}`);
    console.warn(`    ! app never reached the study round; reloading once. DIAG ${JSON.stringify(diag)}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(ROUND_LIVE, null, { timeout: 20000 });
    } catch {
      throw new Error(`${first.message.split("\n")[0]} — twice, so this is not a transient boot. `
        + `DIAG ${JSON.stringify(await diagnose(page))}`);
    }
    assert.strictEqual(count(), 0, `the reload charged a forfeit (saw ${count()})`);
  }
  // The guards (forfeitGuard + leaveGuard) arm in `inStudy` effects. React commits the DOM
  // BEFORE flushing passive effects, so seeing the stage is not proof they ran; a completed
  // frame after that commit is, because React schedules the flush as a task and rAF runs
  // only once that turn's task queue has drained. Two frames, ~32ms — replaces a blind 300ms.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page;
}

const waitForfeit = (page) =>
  page.waitForRequest((r) => r.method() === "POST" && r.url().includes("/api/flashcards/forfeit"), { timeout: 8000 });

/* Every scenario has two halves. The POSITIVE half is condition-based — waitForfeit resolves
   on the real POST, so it never sleeps longer than the app takes. The short waitForTimeout
   after each assertion is the NEGATIVE half: proving that no SECOND (or no first) forfeit
   lands. A settle is the only way to prove a negative, so those stay deliberate rather than
   being "fixed" into a condition that cannot exist. Each is anchored to the event that would
   carry a stray charge, never to a guess about how long the app takes to boot. */

let failures = 0;
async function scenario(name, fn) {
  const { ctx, count, completeBody } = await makeCtx();
  try {
    await fn(ctx, count, completeBody);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  } finally {
    await ctx.close();
  }
}

console.log("flashcards_forfeit_assert:");

// 1) Switch deck abandons the round ⇒ it must forfeit (this is the reported loophole:
//    Switch deck used to be free, then Home from selection was free too).
await scenario("Pause → Switch deck → confirm charges exactly one forfeit", async (ctx, count) => {
  const page = await enterRound(ctx, count);
  await page.click("[data-testid=flash-pause]");
  await page.click("[data-testid=flash-switch]");
  const seen = waitForfeit(page);
  await page.click("[data-testid=flash-switch-confirm]");
  await seen;
  await page.waitForTimeout(400);
  assert.strictEqual(count(), 1, `expected 1 forfeit on Switch deck, saw ${count()}`);
});

// 2) The existing Quit path still charges — exactly once, no double with the new guards.
await scenario("Pause → Quit → confirm charges exactly one forfeit", async (ctx, count) => {
  const page = await enterRound(ctx, count);
  await page.click("[data-testid=flash-pause]");
  await page.click("[data-testid=flash-quit]");
  const seen = waitForfeit(page);
  await page.click("[data-testid=flash-quit-confirm]");
  await seen;
  await page.waitForTimeout(400);
  assert.strictEqual(count(), 1, `expected 1 forfeit on Quit, saw ${count()}`);
});

// 3) Completing the deck then leaving is NOT a forfeit — the fairness contract. Also pins
//    the REAL wire payload of POST /api/flashcards/complete (not just the frontend
//    source): catches topic_tag: "", the wrong prop name, the field commented out with
//    the identifier left dangling in a comment, or a second push site added elsewhere.
await scenario("Complete the deck → Home charges zero forfeits", async (ctx, count, completeBody) => {
  const page = await enterRound(ctx, count);
  await page.click("[data-testid=flash-reveal]");                 // "Show answer" (free-text card)
  await page.waitForSelector(".flash-mark-got:not([disabled])", { timeout: 8000 });
  await page.click(".flash-mark-got");                            // "Got it" → finish (1-card deck) → results
  await page.waitForSelector("[data-testid=flash-exit]", { timeout: 8000 });
  await page.click("[data-testid=flash-exit]");                   // Home from the results screen
  // Anchor the settle to the event that would carry a stray charge: leaving /flashcards
  // unmounts the screen and fires the pagehide/unmount beacon. Wait for the route to
  // actually change, THEN settle — a flat sleep could assert before the beacon could exist.
  await page.waitForFunction(() => !location.pathname.startsWith("/flashcards"), null, { timeout: 10000 });
  await page.waitForTimeout(400);
  assert.strictEqual(count(), 0, `expected 0 forfeits after completing, saw ${count()}`);
  const body = completeBody();
  assert.ok(body && Array.isArray(body.results) && body.results.length > 0,
    `expected POST /api/flashcards/complete to carry a results array, saw ${JSON.stringify(body)}`);
  assert.strictEqual(body.results[0].topic_tag, "iop_nct",
    `expected results[0].topic_tag "iop_nct" on the wire, saw ${JSON.stringify(body.results[0])}`);
  assert.strictEqual(typeof body.results[0].score, "number",
    `expected results[0].score to be a number, saw ${typeof body.results[0].score}`);
});

// 4) Uncontrolled exit: hard-navigate away mid-round ⇒ pagehide beacon forfeits.
await scenario("Hard nav away mid-round charges one forfeit (pagehide beacon)", async (ctx, count) => {
  const page = await enterRound(ctx, count);
  const seen = waitForfeit(page);
  await page.goto(base + "/homepage");                          // full navigation ⇒ pagehide on /flashcards
  await seen;
  await page.waitForTimeout(300);
  assert.strictEqual(count(), 1, `expected 1 forfeit on hard nav, saw ${count()}`);
});

// 5) THE LOOPHOLE (in-app nav): the ⌘K palette sits on top of the immersive deck, so a
//    student could jump away mid-round. It must now open the leave confirm — NOT charge or
//    navigate on its own — and only the confirm charges. (Same choke point the rail links
//    use; see the station suite for the literal sidebar <Link> click.)
await scenario("⌘K → Homepage mid-round → confirm charges exactly one forfeit", async (ctx, count) => {
  const page = await enterRound(ctx, count);
  await page.keyboard.press("Control+k");
  await page.waitForSelector(".aurora-palette-input", { timeout: 6000 });
  await page.click("button.aurora-palette-item:has-text('Homepage')");
  await page.waitForSelector("[data-testid=flash-leave-overlay]", { timeout: 5000 });
  assert.strictEqual(count(), 0, `no charge until confirmed, saw ${count()}`);
  const seen = waitForfeit(page);
  await page.click("[data-testid=flash-leave-confirm]");
  await seen;
  await page.waitForFunction(() => !location.pathname.startsWith("/flashcards"), null, { timeout: 5000 });
  await page.waitForTimeout(300);
  assert.strictEqual(count(), 1, `expected 1 forfeit after confirming, saw ${count()}`);
});

// 6) Cancelling that leave is free and keeps the student in the round — no silent charge.
await scenario("⌘K → Homepage mid-round → Keep playing charges zero forfeits", async (ctx, count) => {
  const page = await enterRound(ctx, count);
  await page.keyboard.press("Control+k");
  await page.waitForSelector(".aurora-palette-input", { timeout: 6000 });
  await page.click("button.aurora-palette-item:has-text('Homepage')");
  await page.waitForSelector("[data-testid=flash-leave-overlay]", { timeout: 5000 });
  await page.click("[data-testid=flash-leave-cancel]");
  await page.waitForTimeout(500);
  assert.strictEqual(count(), 0, `expected 0 forfeits on cancel, saw ${count()}`);
  assert.ok(await page.locator("[data-testid=study-stage]").count(), "must still be studying after cancel");
});

await b.close();
if (failures) { console.error(`\nflashcards_forfeit_assert: ${failures} scenario(s) FAILED`); process.exit(1); }
console.log("\nflashcards_forfeit_assert: all scenarios passed");
