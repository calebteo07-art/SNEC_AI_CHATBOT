#!/usr/bin/env node
/* Mobile audit — the acceptance gate for spec §5.1 of the phone refit.
 *
 * Sweeps every REAL route across the full device matrix and fails on:
 *   1. content clipped by / overflowing the viewport
 *   2. interactive targets under 44x44 (with a named, justified allow-list)
 *   3. any interactive element occluded by the nav (the "CTA covered by the bar" bug)
 *   4. a route that fails to load at all
 *
 * Usage: node --unhandled-rejections=warn tests/mobile_audit.mjs [baseUrl] [--shots]
 *
 * ── Why this file was rewritten from scratch (2026-07-17) ────────────────────────
 * The previous version could not have caught the bugs the user reported, because:
 *
 *  - It built phone contexts WITHOUT `hasTouch`, so `pointer: coarse` never matched
 *    and it audited DESKTOP styling at a phone width. Every phone tier in this app is
 *    coarse-gated (width cannot identify a phone — a 15 Pro Max is 932px wide in
 *    landscape), so the entire sweep was measuring the wrong stylesheet.
 *  - Half its routes did not exist. It swept /profile, /admin, /admin/students,
 *    /admin/accounts, /admin/activity and /supervisor -- all deleted -- and swallowed
 *    the navigation error with `.catch(() => {})`, so it PASSED on 404 pages.
 *  - It measured overflow with `document.scrollingElement.scrollWidth`, which is a
 *    guaranteed false negative here: `.aurora-main-scroll` sets `overflow-x: hidden`,
 *    so content is clipped rather than scrollable and the document never reports it.
 *  - It only ever looked at 390x844, so it never saw landscape at all.
 *
 * Treat any historical "mobile is ~95% clean" claim sourced from it as unfounded.
 * ─────────────────────────────────────────────────────────────────────────────── */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { student, admin, seededContext } from "./_mocks.mjs";
import { VIEWPORTS, DESKTOP } from "./_viewports.mjs";

const base = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://127.0.0.1:3100";
const wantShots = process.argv.includes("--shots");
const OUT = "../.tmp/mobile-audit";

const ROUTES = [
  { path: "/dashboard", name: "home", who: student },
  { path: "/chat", name: "tutor", who: student },
  { path: "/cases", name: "osce-list", who: student },
  { path: "/flashcards", name: "flashcards", who: student },
  { path: "/leaderboard", name: "leaderboard", who: student },
  { path: "/analytics", name: "analytics", who: admin },
];

/* Documented exceptions to the 44x44 rule. An UNEXPLAINED exception is a bug, not a
 * waiver — every entry needs a reason that survives being read aloud. Matched on the
 * element's class list. */
const TARGET_ALLOW = [
  // The rotate gate deliberately has no controls; nothing to allow yet.
];

/* Elements allowed to extend past the viewport: purely decorative, non-interactive
 * bleed (mesh gradients, glow pools). These carry no text and cannot be tapped, and
 * `.aurora-main-scroll { overflow-x: hidden }` clips them, so they are invisible to
 * the user. Anything with text or a click handler is NOT decorative. */
function probe({ allow, touch }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const INTERACTIVE = 'a,button,[role="button"],input,select,textarea,[tabindex]:not([tabindex="-1"])';

  const isDecorative = (el) => {
    const s = getComputedStyle(el);
    if (s.pointerEvents === "none") return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    return false;
  };
  // Text that belongs to THIS element, not a descendant — that's what actually clips.
  const ownText = (el) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join("")
      .slice(0, 40);

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || s.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const sel = (el) => {
    // SVG elements expose className as an SVGAnimatedString, not a string — String()
    // on it yields "[object SVGAnimatedString]". Use baseVal for those.
    const raw = typeof el.className === "string" ? el.className : (el.className?.baseVal ?? "");
    const cls = raw.trim().split(/\s+/).filter(Boolean)[0] || "";
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`;
  };

  // An element wholly outside the viewport is PARKED, not clipped. The Atlas Rail
  // auto-collapses via `transform: translateX(calc(-100% - 28px))`, so on desktop the
  // whole rail and its subtree legitimately sit at left≈-262. That is the design, not
  // a defect. What actually harms a user is content PARTIALLY on screen with the rest
  // cut off — e.g. the 399px-wide .aurora-rail-section in a 390px viewport.
  const onScreen = (r) => r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;

  // ── 1. Overflow that a USER can perceive ──────────────────────────────────────
  const overflow = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || isDecorative(el)) continue;
    const r = el.getBoundingClientRect();
    if (!onScreen(r)) continue;                     // parked off-canvas, by design
    if (r.right <= vw + 1 && r.left >= -1) continue; // fully inside
    const text = ownText(el);
    const interactive = el.matches(INTERACTIVE);
    if (!text && !interactive) continue;            // decorative bleed — clipped, unseen
    overflow.push({
      sel: sel(el), left: Math.round(r.left), right: Math.round(r.right),
      w: Math.round(r.width), text, interactive,
    });
  }

  // ── 2. Tap targets under 44x44 ────────────────────────────────────────────────
  // TOUCH ONLY. 44x44 is a fingertip guideline; applying it to a mouse pointer is
  // noise — a 42px-tall desktop nav row is not a defect.
  const small = [];
  if (touch) {
    for (const el of document.querySelectorAll(INTERACTIVE)) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (!onScreen(r)) continue;
      const s = sel(el);
      if (allow.some((a) => s.includes(a))) continue;
      if (r.height >= 44 && r.width >= 44) continue;
      small.push({
        sel: s, w: Math.round(r.width), h: Math.round(r.height),
        label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30),
      });
    }
  }

  // ── 3. Interactive elements OCCLUDED — genuinely unreachable by thumb ──────────
  // The "See where you stand" bug: present in the DOM, reachable by a test's .click()
  // (which dispatches regardless of occlusion), but physically un-tappable because the
  // nav sits on top of it.
  //
  // Sample FIVE points, not just the centre, and flag only if EVERY one is occluded.
  // Centre-only is too strict for deliberately layered UI: the flashcards coverflow
  // overlaps its cards by design and parks an arrow button over the middle one, so a
  // centre-only test calls a perfectly tappable card "covered". If all five points are
  // blocked, there is nowhere left to press and it is genuinely broken.
  const covered = [];
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + r.width * 0.25, r.top + r.height * 0.25],
      [r.left + r.width * 0.75, r.top + r.height * 0.25],
      [r.left + r.width * 0.25, r.top + r.height * 0.75],
      [r.left + r.width * 0.75, r.top + r.height * 0.75],
    ].filter(([x, y]) => x >= 0 && x <= vw && y >= 0 && y <= vh);
    if (!pts.length) continue; // wholly off-screen — the overflow check's job, not this one

    let blockedBy = null;
    for (const [x, y] of pts) {
      const top = document.elementFromPoint(x, y);
      if (!top || el.contains(top) || top.contains(el)) { blockedBy = null; break; } // a reachable point exists
      blockedBy = blockedBy || top;
    }
    if (blockedBy) {
      covered.push({
        sel: sel(el), by: sel(blockedBy),
        label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30),
      });
    }
  }

  const dedupe = (arr) => {
    const seen = new Set();
    return arr.filter((o) => (seen.has(o.sel) ? false : seen.add(o.sel)));
  };
  return {
    overflow: dedupe(overflow).slice(0, 10),
    small: dedupe(small).slice(0, 10),
    covered: dedupe(covered).slice(0, 10),
  };
}

const results = [];
let failures = 0;
if (wantShots) mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();

for (const v of [...VIEWPORTS, DESKTOP]) {
  console.log(`\n══════ ${v.tag}  ${v.width}x${v.height}  (touch=${!!v.touch}) ══════`);
  for (const route of ROUTES) {
    const ctx = await seededContext(
      b, base, route.who,
      { width: v.width, height: v.height },
      v.touch ? { hasTouch: true, isMobile: true } : {},
    );
    const p = await ctx.newPage();
    let res, loadError = null;
    try {
      const resp = await p.goto(base + route.path, { waitUntil: "domcontentloaded", timeout: 20000 });
      if (resp && resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
      // Wait for the shell to actually exist -- a route that renders nothing must FAIL,
      // not silently pass with zero findings (the old audit's defining bug).
      await p.waitForSelector(".aurora-shell, .aurora-checkin-screen", { timeout: 20000 });
      await p.waitForTimeout(2200); // entrance animations + data settle
      res = await p.evaluate(probe, { allow: TARGET_ALLOW, touch: !!v.touch });
      if (wantShots) await p.screenshot({ path: `${OUT}/${route.name}-${v.tag}.png` });
    } catch (e) {
      loadError = String(e.message || e).split("\n")[0].slice(0, 120);
      res = { overflow: [], small: [], covered: [] };
    } finally {
      await ctx.close();
    }

    const bad = !!loadError || res.overflow.length || res.small.length || res.covered.length;
    if (bad) failures++;
    results.push({ route: route.name, view: v.tag, loadError, ...res });

    if (loadError) {
      console.log(`  ${route.name.padEnd(12)} DID NOT LOAD — ${loadError}`);
    } else if (!bad) {
      console.log(`  ${route.name.padEnd(12)} ok`);
    } else {
      console.log(`  ${route.name.padEnd(12)} ${res.overflow.length} overflow · ${res.small.length} small · ${res.covered.length} covered`);
      for (const o of res.overflow) console.log(`      OVERFLOW  ${o.sel} left=${o.left} right=${o.right} (vw=${v.width})${o.text ? ` "${o.text}"` : " [interactive]"}`);
      for (const s of res.small) console.log(`      SMALL     ${s.sel} ${s.w}x${s.h} "${s.label}"`);
      for (const c of res.covered) console.log(`      COVERED   ${c.sel} "${c.label}" is under ${c.by}`);
    }
  }
}
await b.close();

mkdirSync("../.tmp", { recursive: true });
writeFileSync("../.tmp/mobile-audit.json", JSON.stringify(results, null, 2));
console.log(`\n${"─".repeat(64)}\nswept ${results.length} route×viewport combinations, ${failures} with violations`);
if (failures) {
  console.log("MOBILE AUDIT FAILED");
  process.exit(1);
}
console.log("MOBILE AUDIT PASSED");
