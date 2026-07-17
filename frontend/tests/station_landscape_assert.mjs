#!/usr/bin/env node
/* The OSCE rotate gate forces a phone into landscape FOR the three-pane triptych.
   Landscape must therefore actually DELIVER side-by-side panes.
 *
 * The bug this pins: `@media (max-width: 880px)` stacked .aurora-station-grid to a
 * single column, and a landscape phone is 844-932px WIDE — so it landed squarely in
 * that block. Rotating handed the student the exact layout they rotated to escape.
 * The stack is now gated on `min-height: 481px` (genuinely narrow PORTRAIT-ish
 * viewports); short landscape phones keep the real triptych with per-pane scroll.
 *
 * Usage: node --unhandled-rejections=warn tests/station_landscape_assert.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();

for (const v of [
  { tag: "landscape-narrow", width: 844, height: 390 },
  { tag: "landscape-wide", width: 932, height: 430 },
]) {
  const ctx = await seededContext(b, base, student, { width: v.width, height: v.height }, { hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-testid="station"]', { timeout: 25000 });
  await p.waitForTimeout(1500);

  // The gate is portrait-only; if it shows in landscape the student can never start.
  if (await p.locator(".rotate-gate").isVisible()) die(`${v.tag}: gate must not show in landscape`);
  ok(`${v.tag}: gate hidden in landscape`);

  const r = await p.evaluate(() => {
    const grid = document.querySelector(".aurora-station-grid");
    const cols = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
    const rect = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const { x, y, width, height, right, bottom } = el.getBoundingClientRect();
      return { x, y, width, height, right, bottom };
    };
    return {
      cols,
      eyebot: grid.getAttribute("data-eyebot"),
      aside: rect(".aurora-station-aside"),
      main: rect(".aurora-station-main"),
      vh: window.innerHeight,
      docH: document.documentElement.scrollHeight,
    };
  });

  if (r.cols < 2) die(`${v.tag}: station collapsed to ${r.cols} column — the gate forced landscape FOR the triptych`);
  if (r.aside && r.main && r.main.x < r.aside.right - 1) die(`${v.tag}: panes are stacked, not side-by-side (main.x=${Math.round(r.main.x)} aside.right=${Math.round(r.aside.right)})`);
  ok(`${v.tag}: station is ${r.cols} columns (data-eyebot=${r.eyebot}), panes side-by-side`);

  // The whole point of per-pane scroll: the STATION fits the viewport and each pane
  // scrolls internally. The old block gave .aurora-station-thread{min-height:300px} +
  // .aurora-eyebot-thread{min-height:220px} = 520px of stacked minimums in 390px.
  if (r.docH > r.vh + 2) die(`${v.tag}: station page scrolls (docH=${r.docH} > vh=${r.vh}) — panes must scroll internally, not the page`);
  ok(`${v.tag}: station fits the viewport (docH=${r.docH} <= vh=${r.vh}); panes scroll internally`);

  await ctx.close();
}

console.log("ALL STATION-LANDSCAPE ASSERTIONS PASSED");
await b.close();
