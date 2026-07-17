/* The bottom bar must fit every destination at every phone size, in both orientations,
   with real tap targets — and a phone must NEVER get the hover-only desktop rail.

   861px is not a phone/desktop boundary: a 15 Pro Max in landscape is 932px wide. The
   old `@media (min-width: 861px)` rail tier therefore handed landscape phones a rail
   parked at translateX(-100% - 28px) that only a HOVER can bring back — and touch has no
   hover, leaving a 26px edge handle as the entire navigation. Width can never identify a
   phone; `pointer: coarse` can. Every context here is built with hasTouch so the coarse
   tiers actually match — without it the phone silently gets desktop styling and this
   whole file proves nothing.

   Run: node frontend/tests/mobile_nav_assert.mjs [base] */
import { chromium } from "playwright";
import { student, admin, seededContext } from "./_mocks.mjs";
import { VIEWPORTS, DESKTOP } from "./_viewports.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();

const probe = () =>
  ({
    railMissing: !document.querySelector(".aurora-rail"),
    ...(() => {
      const rail = document.querySelector(".aurora-rail");
      if (!rail) return {};
      const rb = rail.getBoundingClientRect();
      const scroll = document.querySelector(".aurora-main-scroll");
      return {
        railVisible: getComputedStyle(rail).display !== "none",
        railX: rb.x,
        railY: rb.y,
        railH: rb.height,
        railBottom: rb.bottom,
        scrollPadBottom: scroll ? parseFloat(getComputedStyle(scroll).paddingBottom) : -1,
        items: [...document.querySelectorAll(".aurora-navitem")].map((el) => {
          const r = el.getBoundingClientRect();
          // Both label spans are in the DOM (CSS shows one), so textContent concatenates
          // them — the accessible name is the honest identifier here.
          const name = el.getAttribute("aria-label") || (el.textContent || "").trim();
          return { txt: name, name, x: r.x, right: r.right, w: r.width, h: r.height };
        }),
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    })(),
  });

for (const who of [{ u: student, n: "student" }, { u: admin, n: "admin" }]) {
  for (const v of VIEWPORTS) {
    const ctx = await seededContext(b, base, who.u, { width: v.width, height: v.height }, { hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(probe);

    if (r.railMissing) die(`${who.n} ${v.tag}: no .aurora-rail at all — phone has zero navigation`);
    if (!r.railVisible) die(`${who.n} ${v.tag}: rail is display:none — phone has zero navigation`);
    // A phone must never be parked off-screen behind a hover-only reveal.
    if (r.railX < -1) die(`${who.n} ${v.tag}: rail parked off-screen at x=${r.railX} (hover-only desktop rail on a touch device)`);
    // The bar must sit ON the bottom edge, not float or overshoot.
    if (Math.abs(r.railBottom - r.vh) > 1) die(`${who.n} ${v.tag}: bar bottom=${r.railBottom} != viewport height ${r.vh}`);
    // Reserve must cover the real bar, or the last of every page hides behind it.
    if (r.scrollPadBottom + 0.5 < r.railH) die(`${who.n} ${v.tag}: scroll reserve ${r.scrollPadBottom}px < real bar height ${r.railH}px — content hides behind the bar`);
    // Landscape: the bar must not eat the viewport.
    if (v.height <= 480 && r.railH > 0.15 * v.height) die(`${who.n} ${v.tag}: bar is ${r.railH}px = ${((r.railH / v.height) * 100).toFixed(0)}% of a ${v.height}px viewport`);

    for (const it of r.items) {
      if (it.right > r.vw + 1 || it.x < -1) die(`${who.n} ${v.tag}: nav item "${it.txt}" clipped (x=${it.x} right=${it.right} vw=${r.vw})`);
      if (it.h < 44) die(`${who.n} ${v.tag}: nav item "${it.txt}" is ${it.w}x${it.h} — under the 44px touch minimum`);
      if (it.w < 44) die(`${who.n} ${v.tag}: nav item "${it.txt}" is ${it.w}x${it.h} — under the 44px touch minimum`);
      // font-size:0 in landscape strips the visible label, so the accessible name must survive.
      if (!it.name) die(`${who.n} ${v.tag}: a nav item has no accessible name`);
    }
    const expected = who.n === "admin" ? 6 : 5;
    if (r.items.length !== expected) die(`${who.n} ${v.tag}: ${r.items.length} nav items, expected ${expected}`);
    ok(`${who.n} ${v.tag}: bar ${r.railH.toFixed(0)}px (reserve ${r.scrollPadBottom}px), ${r.items.length} items, all on-screen, min ${Math.min(...r.items.map((i) => i.w)).toFixed(0)}x${Math.min(...r.items.map((i) => i.h)).toFixed(0)}`);
    await ctx.close();
  }
}

/* Desktop must still get the hover-only rail: parked off-screen, revealed on hover. */
{
  const ctx = await seededContext(b, base, student, { width: DESKTOP.width, height: DESKTOP.height });
  const p = await ctx.newPage();
  await p.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  const parked = await p.evaluate(() => document.querySelector(".aurora-rail").getBoundingClientRect().x);
  if (parked > -100) die(`desktop: rail is NOT parked off-screen (x=${parked}) — the hover rail regressed`);
  await p.hover(".aurora-rail-handle");
  await p.waitForTimeout(700);
  const revealed = await p.evaluate(() => document.querySelector(".aurora-rail").getBoundingClientRect().x);
  if (Math.abs(revealed) > 1) die(`desktop: rail did not hover-reveal (x=${revealed})`);
  const handle = await p.evaluate(() => getComputedStyle(document.querySelector(".aurora-rail-handle")).display);
  if (handle === "none") die("desktop: edge handle is hidden — desktop navigation regressed");
  /* Exactly ONE label may be visible. Both spans are always in the DOM, so forgetting to
     hide the phone one at desktop renders "Dashboard Home" on every item. */
  const labels = await p.evaluate(() =>
    [...document.querySelectorAll(".aurora-navitem")].map((el) => {
      const shown = [...el.querySelectorAll("span")].filter((s) => getComputedStyle(s).display !== "none");
      return { n: el.getAttribute("aria-label"), shown: shown.map((s) => s.textContent.trim()) };
    }));
  for (const l of labels) {
    if (l.shown.length !== 1) die(`desktop: nav item "${l.n}" shows ${l.shown.length} labels (${l.shown.join(" + ")}) — expected exactly the full label`);
    if (l.shown[0] !== l.n) die(`desktop: nav item shows "${l.shown[0]}" but should show its full label "${l.n}"`);
  }
  ok(`desktop 1440x900: rail parked at x=${parked}, hover-reveals to x=${revealed}, handle visible, labels = ${labels.map((l) => l.shown[0]).join("/")}`);
  await ctx.close();
}

/* The tier truth table — the two rows the matrix above cannot express, because the matrix
   varies SIZE while the whole point of the re-gate is that POINTER decides.

   Row 1: a narrow DESKTOP window (fine pointer, <=860px) must keep the bar it always had —
   the width arm of the tier. Dropping it in favour of `pointer: coarse` alone would hand a
   narrow desktop window the hover rail and silently change desktop behaviour.
   Row 2: a touch TABLET wider than 860px must get the bar, not a rail whose only affordance
   is a hover it cannot produce. */
for (const c of [
  { tag: "narrow desktop window", w: 560, h: 900, touch: false, want: "bar" },
  { tag: "touch tablet >860px", w: 1024, h: 768, touch: true, want: "bar" },
  { tag: "desktop", w: 1440, h: 900, touch: false, want: "rail" },
]) {
  const ctx = await seededContext(b, base, student, { width: c.w, height: c.h }, c.touch ? { hasTouch: true } : {});
  const p = await ctx.newPage();
  await p.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1000);
  const r = await p.evaluate(() => {
    const q = document.querySelector(".aurora-rail").getBoundingClientRect();
    return { x: q.x, y: q.y, w: q.width, h: q.height, vw: window.innerWidth };
  });
  const got = r.x < -50 ? "rail" : r.h < 120 && Math.abs(r.w - r.vw) < 2 ? "bar" : "other";
  if (got !== c.want)
    die(`${c.tag} ${c.w}x${c.h} (pointer:${c.touch ? "coarse" : "fine"}): got the ${got}, expected the ${c.want} — rail@(${r.x},${r.y}) ${r.w}x${r.h}`);
  ok(`${c.tag} ${c.w}x${c.h} pointer:${c.touch ? "coarse" : "fine"} -> ${got} (rail@(${r.x.toFixed(0)},${r.y.toFixed(0)}) ${r.w.toFixed(0)}x${r.h.toFixed(0)})`);
  await ctx.close();
}

console.log("ALL MOBILE-NAV ASSERTIONS PASSED");
await b.close();
