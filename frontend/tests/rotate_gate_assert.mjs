/* OSCE landscape gate — regression harness.
   The four properties that matter, none of which the original test checked:
     1. it is still there after the page settles (not a split-second flash)
     2. it does NOT move when the page scrolls (i.e. it is viewport-fixed)
     3. landscape hides it and the station is usable
     4. rotating BACK to portrait brings it back
   Property 2 is the real invariant: the bug was that .aurora-page-enter's filling
   transform made the gate a scroll-following absolute box. */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();

const phone = await seededContext(b, base, student, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
const p = await phone.newPage();
await p.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
await p.waitForSelector(".rotate-gate", { timeout: 15000 });

// 1. Still there after everything settles.
await p.waitForTimeout(2000);
if (!(await p.locator(".rotate-gate").isVisible())) die("gate vanished within 2s (the split-second flash)");
ok("gate persists >=2s in portrait");

// 1b. It must cover the viewport EXACTLY — not be a tall page-box overlay.
const vp = await p.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
const box = await p.locator(".rotate-gate").boundingBox();
if (Math.abs(box.height - vp.h) > 2 || Math.abs(box.width - vp.w) > 2) {
  die(`gate must match the viewport exactly, got ${box.width}x${box.height} vs ${vp.w}x${vp.h}`);
}
ok("gate matches the viewport box (not the page box)");

// 1c. The message itself must be fully on screen.
const card = await p.locator(".rotate-gate-card").boundingBox();
if (card.y < 0 || card.y + card.height > vp.h) die(`gate card off-screen: y=${card.y} h=${card.height} vp=${vp.h}`);
ok("gate card fully within the viewport");

// 2. THE invariant: scrolling must not move it.
const before = (await p.locator(".rotate-gate").boundingBox()).y;
await p.evaluate(() => {
  document.querySelector(".aurora-main-scroll")?.scrollTo(0, 900);
  window.scrollTo(0, 900);
});
await p.waitForTimeout(400);
const after = (await p.locator(".rotate-gate").boundingBox()).y;
if (Math.abs(after - before) > 1) die(`gate scrolled with content (${before} -> ${after}) — it is not viewport-fixed`);
ok("gate does not move when the page scrolls");

// 3. Landscape hides it, station usable.
await p.setViewportSize({ width: 844, height: 390 });
await p.waitForTimeout(400);
if (await p.locator(".rotate-gate").isVisible()) die("gate must hide in landscape");
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });
ok("landscape -> gate hidden, station present");

// 4. Rotate BACK -> it returns, fully visible.
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(400);
if (!(await p.locator(".rotate-gate").isVisible())) die("gate must RETURN when rotated back to portrait");
const card2 = await p.locator(".rotate-gate-card").boundingBox();
const vp2 = await p.evaluate(() => ({ h: window.innerHeight }));
if (card2.y < 0 || card2.y + card2.height > vp2.h) die(`gate card off-screen after rotate-back: y=${card2.y}`);
ok("rotate back to portrait -> gate returns, card fully visible");
await phone.close();

// 5. The station must NEVER be exposed unguarded while the phone is portrait.
//    RotateGate was a separate ssr:false chunk from CaseSession, so the two resolved
//    independently and the station could paint first -- the user gets a flash of the
//    very screen the gate exists to withhold. Assertions 1-4 are structurally blind to
//    this: they open with waitForSelector(".rotate-gate"), so by construction they never
//    observe the window where the station is up and the gate is not. Sampling every
//    animation frame from before the first page script runs is what makes it visible.
const race = await seededContext(b, base, student, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
const r = await race.newPage();
await r.addInitScript(() => {
  window.__unguarded = 0;
  const tick = () => {
    const station = document.querySelector('[data-testid="station"]');
    const gate = document.querySelector(".rotate-gate");
    const gateShown = gate && getComputedStyle(gate).display !== "none";
    if (station && !gateShown) window.__unguarded++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
// Throttle the CPU so the race window is wide enough to observe reliably, rather than
// depending on chunk-resolution luck on a fast dev box.
const cdp = await race.newCDPSession(r);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
await r.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
await r.waitForSelector('[data-testid="station"]', { timeout: 25000 });
await r.waitForTimeout(600);
const unguarded = await r.evaluate(() => window.__unguarded);
if (unguarded > 0) die(`station rendered WITHOUT the gate for ${unguarded} frames on a portrait phone`);
ok("station is never exposed unguarded during load");
await race.close();

// 6. Desktop (fine pointer), narrow window -> never nagged.
const desk = await seededContext(b, base, student, { width: 560, height: 900 });
const d = await desk.newPage();
await d.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
await d.waitForSelector('[data-testid="station"]', { timeout: 15000 });
await d.waitForTimeout(300);
if (await d.locator(".rotate-gate").isVisible()) die("no gate on a fine-pointer desktop");
ok("desktop narrow portrait -> no gate");
await desk.close();

console.log("ALL ROTATE-GATE ASSERTIONS PASSED");
await b.close();
