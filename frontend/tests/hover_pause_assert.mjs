/* hover_pause_assert — behavioural gate for the coverflow hover-pause (user, 2026-07-24:
   "hover pause in both spinning parts, but only hover over a small region to pause").

   Both drifting coverflows — the home FeatureCarousel and the flashcards CardFanCarousel —
   must hold still while the cursor is over the FRONT CARD and keep flowing everywhere else.
   The hit test itself is unit-tested in hoverPause_logic.mjs; this asserts the WIRING on the
   real running app, which is what /ship-check requires: the rule is a live state invariant
   (the ring is frozen / not frozen), and the drift is written straight to the DOM by a rAF
   loop, so nothing but a real browser can prove it.

   Per surface:
     1. it drifts to begin with (guards against asserting a already-dead ring),
     2. parking the cursor on the front card freezes it,
     3. a point still ON THE STAGE but off the card does NOT freeze it (the "small region"
        half of the directive — this is the assertion that fails if the zone ever grows to
        the whole stage),
     4. leaving resumes the drift.

   Usage: node frontend/tests/hover_pause_assert.mjs [baseURL] */
import { chromium } from "playwright";
import { seededContext, student } from "./_mocks.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const SETTLE = 700;   // ms sampled either side; the slower ring (flashcards) moves ~0.27 topics
let failures = 0;

function check(ok, msg) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${msg}`);
  if (!ok) failures++;
}

/** The live transform string the rAF loop writes onto the front card — it changes every
 *  frame while the ring drifts and is byte-identical while it is held. */
const transformOf = (page, cardSel) =>
  page.evaluate((s) => document.querySelector(s)?.style.transform ?? null, cardSel);

async function movesOver(page, cardSel, ms = SETTLE) {
  const before = await transformOf(page, cardSel);
  await page.waitForTimeout(ms);
  return { moved: before !== (await transformOf(page, cardSel)), before };
}

/** Stage box + the card's LAID-OUT size — the same two numbers inFrontCardZone works from. */
const geometry = (page, stageSel, cardSel) =>
  page.evaluate(([st, cd]) => {
    const stage = document.querySelector(st);
    const card = document.querySelector(cd);
    if (!stage || !card) return null;
    const r = stage.getBoundingClientRect();
    return {
      stage: { left: r.left, top: r.top, width: r.width, height: r.height },
      cardW: card.offsetWidth, cardH: card.offsetHeight,
    };
  }, [stageSel, cardSel]);

async function assertSurface(page, { name, url, ready, stageSel, cardSel }) {
  console.log(`\n── ${name} (${url})`);
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(ready, { timeout: 20000 });
  await page.locator(stageSel).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400); // let the scroll settle before we read the stage box

  const g = await geometry(page, stageSel, cardSel);
  if (!g) { check(false, `${name}: stage/card not found (${stageSel} / ${cardSel})`); return; }
  const cx = g.stage.left + g.stage.width / 2;
  const cy = g.stage.top + g.stage.height / 2;

  // 1. baseline — park the cursor well away from the carousel; it must be drifting.
  await page.mouse.move(4, 4);
  check((await movesOver(page, cardSel)).moved, `${name}: drifts with the cursor away`);

  // 2. the front card holds it.
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(80); // one pointermove + a frame
  const held = await movesOver(page, cardSel);
  check(!held.moved, `${name}: HOLDS while the cursor is on the front card`);

  // 3. still on the stage, but off the card → it must keep flowing. Prefer a horizontal
  //    probe; fall back to a vertical one when the stage is barely wider than the card.
  const padX = g.cardW / 2 + 30, padY = g.cardH / 2 + 30;
  const probe =
    cx + padX < g.stage.left + g.stage.width - 2 ? { x: cx + padX, y: cy, axis: "beside" } :
    cx - padX > g.stage.left + 2 ? { x: cx - padX, y: cy, axis: "beside" } :
    cy + padY < g.stage.top + g.stage.height - 2 ? { x: cx, y: cy + padY, axis: "below" } :
    cy - padY > g.stage.top + 2 ? { x: cx, y: cy - padY, axis: "above" } : null;
  if (!probe) {
    check(false, `${name}: no point exists on the stage outside the card — cannot prove the zone is small`);
  } else {
    await page.mouse.move(probe.x, probe.y);
    await page.waitForTimeout(80);
    check((await movesOver(page, cardSel)).moved,
      `${name}: KEEPS FLOWING on the stage ${probe.axis} the card (zone is the card, not the stage)`);
  }

  // 4. leaving resumes (and never leaves the ring stuck frozen).
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(80);
  await page.mouse.move(4, 4);
  await page.waitForTimeout(80);
  check((await movesOver(page, cardSel)).moved, `${name}: resumes after the cursor leaves`);
}

const browser = await chromium.launch();
// reducedMotion is pinned OFF: under "reduce" both rings park by design and every
// drift assertion here would trivially "pass" as frozen.
const ctx = await seededContext(browser, BASE, student, { width: 1440, height: 900 }, { reducedMotion: "no-preference" });
const page = await ctx.newPage();

await assertSurface(page, {
  name: "home FeatureCarousel", url: "/homepage",
  ready: '[data-testid="feature-carousel"]',
  stageSel: ".hm-ring3d", cardSel: '[data-testid="feature-card"]',
});
await assertSurface(page, {
  name: "flashcards CardFanCarousel", url: "/flashcards",
  ready: '[data-testid="flash-fan"]',
  stageSel: '[data-testid="flash-fan"]', cardSel: ".fan-card",
});

await browser.close();
console.log(failures ? `\nhover_pause_assert: ${failures} FAILED` : "\nhover_pause_assert: all assertions passed");
process.exit(failures ? 1 : 0);
