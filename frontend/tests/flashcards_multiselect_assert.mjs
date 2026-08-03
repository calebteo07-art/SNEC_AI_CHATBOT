/* "Select all that apply" — what LOOKS selected must be what is RECORDED.
 *
 * Branda (2026-08-03): "it can be difficult to tell which options have been selected. In
 * some cases, an option appears selected, but upon submission it is not recorded as
 * selected."
 *
 * Root cause was the CSS cascade — `:hover:not(:disabled)` (0,3,0) outranked `.is-picked`
 * (0,2,0) and both spoke the same violet-border language, so a hovered unpicked tile and
 * a hovered picked tile computed to the SAME border with no ring on either. On touch,
 * `:hover` sticks to the last-tapped element, so a deselected option kept reading as
 * selected. The cascade half is gated in flashcards_option_state_logic.mjs (a static
 * property of the stylesheet, and headless `:hover` emulation is too non-deterministic to
 * gate CI on — two runs of the same probe disagreed on whether hover had applied at all).
 *
 * What is gated HERE is the half a browser can answer honestly: selection is legible by a
 * signal hover cannot impersonate (the lamp chip), and the visible set matches the
 * recorded set after a pick/unpick with the pointer left resting on the deselected tile.
 *
 * Usage (server already warm — see /harness):
 *   node frontend/tests/flashcards_multiselect_assert.mjs http://127.0.0.1:3000
 */
import assert from "node:assert";
import { chromium } from "playwright";
import { seededContext, student } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const b = await chromium.launch();

/* One multi-select card, shaped like the real /api/flashcards/generate payload. Registered
   AFTER the shared mocks so Playwright's last-wins route resolution picks this one. */
const MULTI_CARD = [{
  card_id: "m1",
  stem: "Select ALL factors that can make an NCT reading unreliable.",
  options: [
    "Wearing glasses during the test",
    "Poor positioning or alignment",
    "Blinking or poor cooperation",
    "Sitting still and looking straight ahead",
  ],
  correct: [0, 1, 2],
  qtype: "multi", kind: "practical",
  explanation: "Glasses, misalignment and blinking all corrupt an NCT reading.",
  requires_explanation: false, topic_tag: "iop_nct", difficulty: "medium",
  repetitions: 0, easiness: 2.5, interval_days: 1,
}];

/* Reduced motion collapses the entry rise so the options are settled when measured. It
   force-sets opacity/transform only; border, box-shadow and the lamp are untouched. */
const ctx = await seededContext(b, base, student, undefined, { reducedMotion: "reduce" });
await ctx.route("**/api/flashcards/generate*", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MULTI_CARD) }));
const page = await ctx.newPage();
await page.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="flash-setup"]', { timeout: 25000 });
const fan = await page.locator(".fan-stage").boundingBox();
await page.mouse.click(Math.round(fan.x + fan.width / 2), Math.round(fan.y + fan.height / 2));
await page.waitForSelector('[data-testid="flash-intro"]', { timeout: 15000 });
await page.locator('[data-testid="flash-intro-begin"]').click();
await page.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });
await page.waitForSelector('[data-testid="flash-multi"]', { timeout: 8000 });
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="flash-option"]').length === 4,
  null, { timeout: 8000 });

/* Transitions OFF for measurement. `.flash-lamp` transitions `all .18s`, and headless
   Chromium throttles rAF on a page that isn't foregrounded — which freezes a transition
   mid-flight, so getComputedStyle reports the last PAINTED value rather than the current
   one. That made the lamp lag a full interaction behind the class: a deselected option
   still read as violet, and the harness reported the app broken when it was not. Only
   `transition` is killed, never `animation` — `.flash-option`'s entry keyframe owns its
   opacity, and stripping it would strand every answer invisible. What is under test is
   the END state of the cascade, which transitions only delay. */
await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });

const opt = page.locator('[data-testid="flash-option"]');

const raw = () => page.evaluate(() =>
  [...document.querySelectorAll('[data-testid="flash-option"]')].map((el) => {
    const lamp = getComputedStyle(el.querySelector(".flash-lamp"));
    return {
      aria: el.getAttribute("aria-checked") === "true",
      // The lamp is the read: hover styles the TILE and never the lamp, so a lamp-based
      // "looks picked" cannot be faked or erased by a stray hover state.
      lamp: `${lamp.backgroundColor}|${lamp.color}|${(el.querySelector(".flash-lamp").textContent || "").trim()}`,
    };
  }));

/* `.flash-lamp` transitions (all .18s), so a bare read after a click samples the animation
   rather than the state. Anchor on the aria flip — a discrete event that proves React
   committed — and only then let the style settle. "Unchanged for 90ms" alone is not
   enough: before the change has started, it is also unchanged. */
async function settle(expected) {
  await page.waitForFunction((exp) => {
    const els = [...document.querySelectorAll('[data-testid="flash-option"]')];
    return els.every((el, i) => (el.getAttribute("aria-checked") === "true") === exp.includes(i));
  }, expected, { timeout: 5000 });
  let prev = JSON.stringify(await raw());
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(90);
    const now = JSON.stringify(await raw());
    if (now === prev) return JSON.parse(now);
    prev = now;
  }
  throw new Error("option styling never settled");
}

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failures += 1; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

console.log("flashcards_multiselect_assert:");

await page.mouse.move(4, 4);
/* Per-option, not one shared value: the lamp signature includes the letter (a/b/c/d), so
   every option differs from every other by construction. "Looks picked" means changed
   from ITS OWN resting state. */
const baseline = (await settle([])).map((o) => o.lamp);
const lookPicked = (r) => r.map((o, i) => (o.lamp !== baseline[i] ? i : -1)).filter((i) => i >= 0);

// 1. Selection needs a signal beyond the tile border. The complaint starts here: picked
//    changed border-color and added a ring, and left the lamp chip byte-identical to an
//    untouched option — so "which ones did I pick?" came down to spotting a hairline.
await check("a picked option is distinguishable by more than its border", async () => {
  await opt.nth(0).click();
  await page.mouse.move(4, 4);
  const r = await settle([0]);
  assert.notStrictEqual(r[0].lamp, baseline[0],
    `picked option a has the same lamp as when unpicked (${r[0].lamp}) — selection is `
    + "carried by border-color alone, which is what made it hard to see");
  assert.strictEqual(r[1].lamp, baseline[1], "an untouched option must not look picked");
});

// 2. THE REPORTED BUG, stated exactly. Pick b, unpick b, and leave the pointer resting on
//    b — the sticky-hover position on a touch device. What is visibly picked must be what
//    is recorded, or a student submits believing the difference was counted.
await check("what looks picked === what is recorded (pick a, pick b, unpick b)", async () => {
  await opt.nth(1).click();
  await settle([0, 1]);
  await opt.nth(1).click();
  const r = await settle([0]);
  const looks = lookPicked(r);
  const recorded = r.map((o, i) => (o.aria ? i : -1)).filter((i) => i >= 0);
  assert.deepStrictEqual(recorded, [0], `expected only option a recorded, saw ${JSON.stringify(recorded)}`);
  assert.deepStrictEqual(looks, recorded,
    `options ${JSON.stringify(looks)} LOOK selected but ${JSON.stringify(recorded)} are recorded`);
});

// 3. The lock submits exactly the visible set — closing the loop from pixels to grading.
//    correct is [0,1,2], so a lock on {a} alone must resolve WRONG; if the deselected b
//    were still counted the verdict would not change, but a stray extra pick would.
await check("locking submits exactly the visible selection", async () => {
  await opt.nth(2).click();
  await opt.nth(1).click();
  const r = await settle([0, 1, 2]);
  const looks = lookPicked(r);
  assert.deepStrictEqual(looks, [0, 1, 2], `expected a, b, c to look picked, saw ${JSON.stringify(looks)}`);
  await page.locator(".flash-lock.is-armed").click();
  await page.waitForSelector('[data-testid="flash-payoff"]', { timeout: 10000 });
  const verdict = await page.locator('[data-testid="flash-payoff"]').getAttribute("class");
  assert.ok(/is-right/.test(verdict),
    `selecting exactly the correct set {a,b,c} graded as wrong (payoff class "${verdict}")`);
});

await ctx.close();
await b.close();

if (failures) {
  console.error(`\nflashcards_multiselect_assert: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nflashcards_multiselect_assert: all assertions passed");
