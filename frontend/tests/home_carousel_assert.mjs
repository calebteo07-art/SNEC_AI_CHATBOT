/* FeatureCarousel — the two functional blockers on the home surface (plan Task 7).

   A. Scrolling the home page must NEVER navigate. `moved` was set by HORIZONTAL travel
      only (`Math.abs(e.clientX - downX) > TAP_SLOP`), so a vertical scroll flick — |dx|<8,
      <700ms — satisfied the tap test and router.push()ed the user into another route. The
      carousel sits mid-page directly in the path of the primary scroll gesture.

   B. A tap must open a card the user can SEE. `SX = 346` was hardcoded desktop spacing
      with `[]` deps, so at phone widths the neighbours projected off-screen and
      openNearest still resolved edge taps to them — a feature the user never saw.

   The locked stage-resolved pick (design-locks.md, Home: "coverflow mechanics unchanged
   — drift / tap-to-nearest / arrows / keyboard") must survive both fixes: cards stay
   pointer-events:none and a tap is resolved against live rects, in FULL motion.

   NOTE ON THE DRIFT RACE: the coverflow never stops moving (BASE drift ~0.3 cards/sec),
   so geometry measured from Node is already stale by the time the click lands — a probe
   taken 200ms early lands exactly on the front-card boundary and flaps. Every expectation
   below is therefore captured INSIDE the page, in a capture-phase listener on the same
   pointerup dispatch the component handles, so the rects are byte-identical to the ones
   openNearest sees. Do not "fix" a flake here by re-measuring from Node. */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";
import { VIEWPORTS, DESKTOP } from "./_viewports.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();

/* Live geometry of the coverflow, measured the way openNearest measures it. */
const probe = () => {
  const stage = document.querySelector(".hm-ring3d").getBoundingClientRect();
  const mid = stage.left + stage.width / 2;
  const cards = [...document.querySelectorAll(".hm-fcard")].map((c) => {
    const r = c.getBoundingClientRect();
    const centre = r.left + r.width / 2;
    return { href: new URL(c.href).pathname, centre, onStage: centre >= stage.left && centre <= stage.right };
  });
  const front = cards.reduce((a, c) => (Math.abs(c.centre - mid) < Math.abs(a.centre - mid) ? c : a));
  // The live card spacing SX, recovered exactly and independently of the drift phase.
  // Each card's own transform starts with translateX(d * SX) and the three cards' d
  // values are integer-spaced, so the SMALLEST pairwise gap between their matrix tx
  // components is exactly one SX. (Max-spread would work too but it samples a drifting
  // |d| in [1, 1.5] and so is not comparable across two measurements.)
  const tx = [...document.querySelectorAll(".hm-fcard")].map((c) => {
    const m = getComputedStyle(c).transform;
    return new DOMMatrix(m === "none" ? undefined : m).m41;
  });
  let sx = Infinity;
  for (let i = 0; i < tx.length; i++)
    for (let j = i + 1; j < tx.length; j++) sx = Math.min(sx, Math.abs(tx[i] - tx[j]));
  return {
    stage: { left: stage.left, right: stage.right, mid },
    cards, front, sx,
    cardW: document.querySelector(".hm-fcard").offsetWidth,
    vw: window.innerWidth,
  };
};

/* Record, on the very pointerup the component acts on, which card the tap SHOULD open
   (nearest on-stage centre) and which one the old unfiltered algorithm WOULD have
   opened (nearest centre, on-screen or not). Race-free by construction. */
const armTapProbe = (probeSrc) => {
  window.__tap = null;
  const fn = new Function("return (" + probeSrc + ")")();
  window.addEventListener("pointerup", (e) => {
    const g = fn();
    const near = (list) => list.reduce((a, c) => (Math.abs(c.centre - e.clientX) < Math.abs(a.centre - e.clientX) ? c : a), list[0]);
    const onStage = g.cards.filter((c) => c.onStage);
    window.__tap = {
      x: e.clientX,
      naive: near(g.cards),
      expect: onStage.length ? near(onStage) : null,
      front: g.front,
    };
  }, true); // capture: fires before the component's own bubble-phase window listener
};

async function openHome(ctx, viewport) {
  const p = await ctx.newPage();
  await p.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".hm-carousel", { timeout: 15000 });
  await p.waitForTimeout(1200);
  // The carousel sits well below the fold on a phone. boundingBox() is in VIEWPORT
  // coords, so without scrolling it into view the tap lands at y>viewport, hits nothing,
  // and every assertion passes vacuously (measured: box.y=1025 in an 844px viewport).
  await p.locator(".hm-carousel").scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  const box = await p.locator(".hm-carousel").boundingBox();
  const cy = Math.round(box.y + box.height / 2);
  if (cy < 0 || cy > viewport.height)
    die(`${viewport.tag}: carousel centre y=${cy} is outside the ${viewport.height}px viewport — a tap would hit nothing and every assertion would be vacuous`);
  return { p, cy };
}

for (const v of VIEWPORTS) {
  const ctx = await seededContext(b, base, student, { width: v.width, height: v.height }, { hasTouch: true, isMobile: true });
  const { p, cy } = await openHome(ctx, v);
  const g0 = await p.evaluate(probe);
  const cx = Math.round(g0.stage.mid);

  // ── A. the scroll hijack ────────────────────────────────────────────────
  await p.evaluate(() => {
    window.__stageHit = 0;
    document.querySelector(".hm-ring3d").addEventListener("pointerdown", () => { window.__stageHit++; }, true);
  });
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  for (let i = 1; i <= 6; i++) await p.mouse.move(cx + 2, cy - i * 22); // |dx|<8, fast
  await p.mouse.up();
  await p.waitForTimeout(900);
  if (!(await p.evaluate(() => window.__stageHit)))
    die(`${v.tag}: the flick never reached the carousel stage — the test is not exercising the bug`);
  if (!p.url().endsWith("/homepage"))
    die(`${v.tag}: a vertical scroll flick navigated to ${p.url()} — scroll hijack`);
  ok(`${v.tag}: vertical flick over the carousel does not navigate`);

  // The front card — the one carrying the readable copy — must fit the viewport.
  // Measured while we are still ON /dashboard (the taps below navigate away).
  if (g0.cardW > v.width - 32)
    die(`${v.tag}: .hm-fcard is ${g0.cardW}px wide in a ${v.width}px viewport (must be <= vw-32 = ${v.width - 32})`);
  ok(`${v.tag}: front card ${g0.cardW}px fits the ${v.width}px viewport (limit ${v.width - 32})`);

  // ── B. an edge tap must not open an off-screen card ─────────────────────
  await p.locator(".hm-carousel").scrollIntoViewIfNeeded();
  await p.evaluate(armTapProbe, probe.toString());
  const edgeX = Math.round(g0.stage.left + 4);
  await p.mouse.click(edgeX, cy);
  await p.waitForTimeout(900);
  const tapB = await p.evaluate(() => window.__tap);
  const landedB = new URL(p.url()).pathname;
  if (!tapB) die(`${v.tag}: the edge tap never reached the page`);
  if (!tapB.naive.onStage && landedB === tapB.naive.href)
    die(`${v.tag}: a tap at the stage's left edge (x=${edgeX}) opened ${landedB} — a card centred at x=${Math.round(tapB.naive.centre)}, off-screen`);
  if (landedB !== tapB.expect.href)
    die(`${v.tag}: an edge tap opened ${landedB}, expected the visible card ${tapB.expect.href} (centre x=${Math.round(tapB.expect.centre)})`);
  ok(`${v.tag}: an edge tap opens the visible card (${landedB})${tapB.naive.onStage ? "" : `, not the off-screen ${tapB.naive.href} at x=${Math.round(tapB.naive.centre)}`}`);

  // ── C. the locked stage-resolved pick still works, in FULL motion ───────
  await p.goBack({ waitUntil: "domcontentloaded" });
  await p.waitForSelector(".hm-carousel", { timeout: 15000 });
  await p.waitForTimeout(1200);
  await p.locator(".hm-carousel").scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await p.evaluate(armTapProbe, probe.toString());
  const box2 = await p.locator(".hm-carousel").boundingBox();
  await p.mouse.click(cx, Math.round(box2.y + box2.height / 2));
  await p.waitForTimeout(900);
  const tapC = await p.evaluate(() => window.__tap);
  if (p.url().endsWith("/homepage"))
    die(`${v.tag}: tapping the front card no longer opens it — stage-resolved pick regressed`);
  if (new URL(p.url()).pathname !== tapC.front.href)
    die(`${v.tag}: a centre tap opened ${new URL(p.url()).pathname}, but the front card at tap time was ${tapC.front.href}`);
  ok(`${v.tag}: a centre tap opens the front card (${tapC.front.href}) in full motion`);
  await ctx.close();
}

// ── D. spacing is derived from the card, and RECOMPUTES on resize/rotate ──
// With SX hardcoded at 346 and `[]` deps + no resize listener, the spread was identical
// at every viewport and never changed on rotate. It must track the card width.
{
  const ctx = await seededContext(b, base, student, { width: DESKTOP.width, height: DESKTOP.height }, { hasTouch: true, isMobile: true });
  const { p } = await openHome(ctx, DESKTOP);
  const wide = await p.evaluate(probe);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(600);
  await p.locator(".hm-carousel").scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  const narrow = await p.evaluate(probe);
  if (narrow.cardW >= wide.cardW)
    die(`resize: card width did not shrink (${wide.cardW} -> ${narrow.cardW})`);
  if (Math.abs(narrow.sx - wide.sx) < 1)
    die(`resize: card spacing did not recompute after the viewport shrank (SX stayed ${wide.sx.toFixed(1)}px while the card went ${wide.cardW} -> ${narrow.cardW}px) — SX is frozen at its mount-time value`);
  // SX must stay proportional to the card at both sizes (the desktop ratio is 346/466).
  const r1 = wide.sx / wide.cardW, r2 = narrow.sx / narrow.cardW;
  if (Math.abs(r1 - 346 / 466) > 0.01 || Math.abs(r2 - 346 / 466) > 0.01)
    die(`resize: SX/card ratio is ${r1.toFixed(3)} wide / ${r2.toFixed(3)} narrow, expected ${(346 / 466).toFixed(3)} — spacing is not derived from the card`);
  ok(`resize: SX recomputes with the card (${wide.cardW}px -> SX ${wide.sx.toFixed(1)}px, then ${narrow.cardW}px -> SX ${narrow.sx.toFixed(1)}px; ratio ${r1.toFixed(3)}/${r2.toFixed(3)})`);
  await ctx.close();
}

console.log("ALL HOME-CAROUSEL ASSERTIONS PASSED");
await b.close();
