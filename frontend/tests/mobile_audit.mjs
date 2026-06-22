#!/usr/bin/env node
/* Mobile responsiveness audit.
 * Loads every route at a phone viewport (390x844), screenshots it, and detects
 * horizontal overflow + sub-44px tap targets. Writes a JSON catalog and exits
 * non-zero if any route has violations — so it is also the gate for fix tasks.
 *
 * Usage:  node tests/mobile_audit.mjs [prefix] [baseUrl] [route ...]
 *   e.g.  node tests/mobile_audit.mjs m
 *         node tests/mobile_audit.mjs m http://127.0.0.1:3000 /dashboard /chat
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { J, student, admin, seededContext } from "./_mocks.mjs";

const prefix = process.argv[2] ?? "m";
const base = process.argv[3] ?? "http://127.0.0.1:3000";
const only = process.argv.slice(4);
const PHONE = { width: 390, height: 844 };

// Runs in the browser: returns overflow + small-tap-target findings for the page.
function probe() {
  const vw = window.innerWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") continue;
    if (r.right > vw + 1 || r.left < -1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.toString().slice(0, 60)) || "",
        right: Math.round(r.right), width: Math.round(r.width),
      });
    }
  }
  // de-dupe by class, keep widest few
  const seen = new Set();
  const overflow = offenders
    .sort((a, b) => b.right - a.right)
    .filter((o) => (seen.has(o.cls) ? false : seen.add(o.cls)))
    .slice(0, 8);

  const smallTargets = [];
  for (const el of document.querySelectorAll('a,button,[role="button"],input,select,textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") continue;
    if (r.height < 44 || r.width < 24) {
      smallTargets.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.toString().slice(0, 50)) || "",
        w: Math.round(r.width), h: Math.round(r.height),
        label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30),
      });
    }
  }
  const docOverflow = Math.max(0, document.scrollingElement.scrollWidth - vw);
  return { docOverflow, overflow, smallTargets: smallTargets.slice(0, 12) };
}

async function audit(ctx, routes, label, results) {
  const page = await ctx.newPage();
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2000);
    const name = `${prefix}${r === "/" ? "-login" : r.replace(/\//g, "-")}.png`;
    await page.screenshot({ path: name, fullPage: false });
    const res = await page.evaluate(probe);
    const bad = res.docOverflow > 1 || res.overflow.length > 0;
    results.push({ route: r, label: label.trim(), ...res, bad });
    const tag = bad ? `OVERFLOW +${res.docOverflow}px (${res.overflow.length} el)` : "ok";
    const tt = res.smallTargets.length ? ` · ${res.smallTargets.length} small targets` : "";
    console.log(`${label} ${r.padEnd(16)} ${tag}${tt}`);
  }
  await page.close();
}

const STUDENT = ["/checkin", "/dashboard", "/cases", "/cases/C001", "/flashcards", "/profile", "/chat"];
const ADMIN = ["/admin", "/admin/students", "/admin/accounts", "/admin/activity"];
const SUPERVISOR = ["/supervisor"];

const browser = await chromium.launch();
const results = [];
if (only.length > 0) {
  const ctx = await seededContext(browser, base, student, PHONE);
  await audit(ctx, only, "custom ", results);
  await ctx.close();
} else {
  const clean = await seededContext(browser, base, null, PHONE);
  await clean.route("**/api/auth/me", (r) => r.fulfill(J({ error: "unauthenticated" }, 401)));
  await audit(clean, ["/"], "public ", results);
  await clean.close();

  const sctx = await seededContext(browser, base, student, PHONE);
  await audit(sctx, STUDENT, "student", results);
  await sctx.close();

  const supctx = await seededContext(browser, base, { ...student, role: "supervisor" }, PHONE);
  await audit(supctx, SUPERVISOR, "superv ", results);
  await supctx.close();

  const actx = await seededContext(browser, base, admin, PHONE);
  await audit(actx, ADMIN, "admin  ", results);
  await actx.close();
}
await browser.close();

writeFileSync(`mobile-audit-${prefix}.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.bad);
console.log(`\naudit complete — ${results.length} routes, ${failed.length} with overflow`);
if (failed.length) process.exit(1);
