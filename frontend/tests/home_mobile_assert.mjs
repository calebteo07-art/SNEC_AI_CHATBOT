/* Home layout invariants at every device in the matrix (plan Task 7, spec §5.1).

   Home is the surface the user singled out: "the homepage especially does not look good
   on mobile portrait and landscape mode." The measured causes, all in home.css, were that
   its ONLY two queries were `max-width: 900px` and `max-width: 560px` — so a landscape
   phone (844-932 WIDE but 390-430 TALL) sailed past both and got the desktop ramp:
   a 62px headline eating 44% of the screen and a greeting card 112% of the viewport tall.

   SCOPE NOTE — this asserts home-owned selectors (`.hm-*`) only. The Atlas Rail
   (`.aurora-rail` / `.aurora-navitem`) is Task 4/5's and is audited by mobile_audit.mjs
   across all six routes; it is referenced here only as the occluder the CTA must clear.

   Measure rects against the viewport, never document.scrollWidth: `.aurora-main-scroll`
   sets `overflow-x: hidden`, so scrollWidth reads clean on every route even when content
   is clipped. The overflow is real; the scrollbar is just suppressed. */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";
import { VIEWPORTS, DESKTOP } from "./_viewports.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
let failed = 0;
const ok = (m) => console.log("  PASS:", m);
const bad = (m) => { console.error("  FAIL:", m); failed++; };
const b = await chromium.launch();

for (const v of [...VIEWPORTS, DESKTOP]) {
  const ctx = await seededContext(b, base, student, { width: v.width, height: v.height },
    v.touch ? { hasTouch: true, isMobile: true } : {});
  const p = await ctx.newPage();
  await p.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".hm-greet", { timeout: 15000 });
  await p.waitForTimeout(1200);
  console.log(`\n══ ${v.tag}  ${v.width}x${v.height} ══`);

  const m = await p.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
    const h1 = document.querySelector(".hm-greet h1");
    const chip = document.querySelector(".hm-chip");
    // Every home-owned element whose box escapes the viewport. The coverflow's angled
    // side cards are excluded: they are the locked design (a 3D carousel whose
    // neighbours bleed off and are clipped) — the FRONT card's fit is asserted in
    // home_carousel_assert.mjs instead.
    const overflow = [...document.querySelectorAll(".aurora-home *")].filter((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (e.closest(".hm-fcard")) return false;
      return r.left < -1 || r.right > window.innerWidth + 1;
    }).map((e) => ({
      sel: e.tagName.toLowerCase() + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/)[0] : ""),
      l: Math.round(e.getBoundingClientRect().left), r: Math.round(e.getBoundingClientRect().right),
    })).slice(0, 6);
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      h1: box(".hm-greet h1"), h1font: parseFloat(getComputedStyle(h1).fontSize),
      h1lines: Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)),
      greet: box(".hm-greet"), lb: box(".hm-lb"), chip: box(".hm-chip"),
      chipLine: parseFloat(getComputedStyle(chip.querySelector("span")).lineHeight),
      overflow,
    };
  });

  // 1. nothing home-owned escapes the viewport
  if (m.overflow.length) bad(`${m.overflow.length} element(s) past the viewport: ${m.overflow.map((o) => `${o.sel}[${o.l}..${o.r}]`).join(", ")} (vw=${m.vw})`);
  else ok(`no home element extends past the ${m.vw}px viewport`);

  // 2. the headline must not eat the screen
  const h1pct = (m.h1.h / m.vh) * 100;
  if (h1pct > 40) bad(`.hm-greet h1 is ${m.h1font}px x ${m.h1lines} lines = ${Math.round(m.h1.h)}px, ${h1pct.toFixed(0)}% of the ${m.vh}px viewport (limit 40%)`);
  else ok(`headline ${m.h1font}px, ${m.h1lines} lines, ${Math.round(m.h1.h)}px = ${h1pct.toFixed(0)}% of viewport height`);

  // 3. the level pill must render on ONE line (it wrapped inside a 999px pill: 64px tall)
  if (m.chip.h > m.chipLine * 1.9)
    bad(`.hm-chip is ${Math.round(m.chip.h)}px tall with a ${m.chipLine}px line-height — its text is wrapping inside the pill`);
  else ok(`.hm-chip on one line (${Math.round(m.chip.h)}px, line-height ${m.chipLine})`);

  // 4. the primary CTA is reachable: fully on screen and not under the nav
  await p.locator(".hm-lb").scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  const cta = await p.evaluate(() => {
    const e = document.querySelector(".hm-lb");
    const r = e.getBoundingClientRect();
    const rail = document.querySelector(".aurora-rail")?.getBoundingClientRect() ?? null;
    // Is any point of the CTA actually hittable? (elementFromPoint honours z-order.)
    const pts = [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5], [0.5, 0.15], [0.5, 0.85]];
    let reachable = false;
    for (const [fx, fy] of pts) {
      const t = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      if (t && (e.contains(t) || t.contains(e))) { reachable = true; break; }
    }
    return { r: { l: r.left, t: r.top, b: r.bottom, r: r.right, w: r.width, h: r.height },
      rail: rail && { l: rail.left, t: rail.top, b: rail.bottom, r: rail.right }, reachable,
      vw: innerWidth, vh: innerHeight };
  });
  const off = cta.r.t < 0 || cta.r.b > cta.vh + 1 || cta.r.l < 0 || cta.r.r > cta.vw + 1;
  if (off) bad(`CTA .hm-lb not fully on screen once scrolled to: [${Math.round(cta.r.l)},${Math.round(cta.r.t)} .. ${Math.round(cta.r.r)},${Math.round(cta.r.b)}] in ${cta.vw}x${cta.vh}`);
  else if (!cta.reachable) bad(`CTA .hm-lb is covered — no point of it is hittable (rail at ${JSON.stringify(cta.rail)})`);
  else ok(`CTA reachable: ${Math.round(cta.r.w)}x${Math.round(cta.r.h)} at y=${Math.round(cta.r.t)}..${Math.round(cta.r.b)}${cta.rail ? `, rail y=${Math.round(cta.rail.t)}..${Math.round(cta.rail.b)}` : ""}`);

  // 5. touch targets on home-owned controls
  if (v.touch) {
    const small = await p.evaluate(() => [".hm-lb", ".hm-carbtn", ".hm-eyeconmenu-btn"].flatMap((s) =>
      [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect();
        return r.width < 44 || r.height < 44 ? `${s} ${Math.round(r.width)}x${Math.round(r.height)}` : null; }).filter(Boolean)));
    if (small.length) bad(`sub-44px touch targets: ${small.join(", ")}`);
    else ok(`home touch targets >= 44x44`);
  }
  await ctx.close();
}

console.log(failed ? `\nHOME MOBILE: ${failed} FAILING ASSERTION(S)` : "\nALL HOME-MOBILE ASSERTIONS PASSED");
await b.close();
process.exit(failed ? 1 : 0);
