/* Behavioral harness for the flashcards quit-forfeit loophole (ship-check verify).
   Drives the real study screen against a served standalone build with mocked APIs and
   asserts POST /api/flashcards/forfeit fires exactly once on every unfinished exit — and
   NOT at all when a deck is completed.

   Usage (server already warm — see /harness):
     node --experimental-strip-types frontend/tests/flashcards_forfeit_assert.mjs http://127.0.0.1:3000

   Scenarios:
     1. Pause → Switch deck → confirm            ⇒ 1 forfeit   (the reported loophole)
     2. Pause → Quit → confirm                   ⇒ 1 forfeit   (existing path, still once)
     3. Answer the deck to completion → Home     ⇒ 0 forfeits  (finished round is free)
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
  const ctx = await seededContext(b, base, student);
  await ctx.addInitScript((s) => {
    sessionStorage.setItem("eyebot_session", JSON.stringify(s));
  }, SESSION);
  // The shared mocks report the student as customized:true, so the mandatory first-login
  // gate never redirects off /flashcards (no local onboarding flag exists any more).
  let count = 0;
  ctx.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/flashcards/forfeit")) count += 1;
  });
  return { ctx, count: () => count };
}

async function enterRound(ctx) {
  const page = await ctx.newPage();
  await page.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid=study-stage]", { timeout: 20000 });
  await page.waitForTimeout(300); // let the inStudy effect arm the guard
  return page;
}

const waitForfeit = (page) =>
  page.waitForRequest((r) => r.method() === "POST" && r.url().includes("/api/flashcards/forfeit"), { timeout: 8000 });

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

console.log("flashcards_forfeit_assert:");

// 1) Switch deck abandons the round ⇒ it must forfeit (this is the reported loophole:
//    Switch deck used to be free, then Home from selection was free too).
await scenario("Pause → Switch deck → confirm charges exactly one forfeit", async (ctx, count) => {
  const page = await enterRound(ctx);
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
  const page = await enterRound(ctx);
  await page.click("[data-testid=flash-pause]");
  await page.click("[data-testid=flash-quit]");
  const seen = waitForfeit(page);
  await page.click("[data-testid=flash-quit-confirm]");
  await seen;
  await page.waitForTimeout(400);
  assert.strictEqual(count(), 1, `expected 1 forfeit on Quit, saw ${count()}`);
});

// 3) Completing the deck then leaving is NOT a forfeit — the fairness contract.
await scenario("Complete the deck → Home charges zero forfeits", async (ctx, count) => {
  const page = await enterRound(ctx);
  await page.click("[data-testid=flash-reveal]");                 // "Show answer" (free-text card)
  await page.waitForSelector(".flash-mark-got:not([disabled])", { timeout: 8000 });
  await page.click(".flash-mark-got");                            // "Got it" → finish (1-card deck) → results
  await page.waitForSelector("[data-testid=flash-exit]", { timeout: 8000 });
  await page.click("[data-testid=flash-exit]");                   // Home from the results screen
  await page.waitForTimeout(600);
  assert.strictEqual(count(), 0, `expected 0 forfeits after completing, saw ${count()}`);
});

// 4) Uncontrolled exit: hard-navigate away mid-round ⇒ pagehide beacon forfeits.
await scenario("Hard nav away mid-round charges one forfeit (pagehide beacon)", async (ctx, count) => {
  const page = await enterRound(ctx);
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
  const page = await enterRound(ctx);
  await page.keyboard.press("Control+k");
  await page.waitForSelector(".aurora-palette-input", { timeout: 6000 });
  await page.click("button.aurora-palette-item:has-text('Homepage')");
  await page.waitForSelector("[data-testid=flash-leave-overlay]", { timeout: 5000 });
  assert.strictEqual(count(), 0, `no charge until confirmed, saw ${count()}`);
  const seen = waitForfeit(page);
  await page.click("[data-testid=flash-leave-confirm]");
  await seen;
  await page.waitForFunction(() => !location.pathname.startsWith("/flashcards"), { timeout: 5000 });
  await page.waitForTimeout(300);
  assert.strictEqual(count(), 1, `expected 1 forfeit after confirming, saw ${count()}`);
});

// 6) Cancelling that leave is free and keeps the student in the round — no silent charge.
await scenario("⌘K → Homepage mid-round → Keep playing charges zero forfeits", async (ctx, count) => {
  const page = await enterRound(ctx);
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
