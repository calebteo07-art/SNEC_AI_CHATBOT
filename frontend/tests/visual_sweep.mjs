#!/usr/bin/env node
/* PHOTOPIC visual sweep harness.
 * Drives every route with mocked APIs and saves screenshots to repo root.
 *
 * Usage:  node tests/visual_sweep.mjs <prefix> [baseUrl] [route ...]
 *   e.g.  node tests/visual_sweep.mjs p1
 *         node tests/visual_sweep.mjs p1-mobile http://127.0.0.1:3000 /dashboard
 *
 * Gotcha (from v1): the service worker bypasses route interception — always
 * stub navigator.serviceWorker.register before page scripts run.
 */
import { chromium } from "playwright";
import { J, student, admin, mockApis, seededContext } from "./_mocks.mjs";

const prefix = process.argv[2] ?? "sweep";
const base = process.argv[3] ?? "http://127.0.0.1:3000";
const only = process.argv.slice(4);

async function sweep(ctx, routes, label) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e?.message ?? e).slice(0, 140)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/webpack-hmr|WebSocket/.test(m.text())) errs.push("console: " + m.text().slice(0, 140));
  });
  for (const r of routes) {
    errs.length = 0;
    await page.goto(base + r, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2200);
    const name = `${prefix}${r === "/" ? "-login" : r.replace(/\//g, "-")}.png`;
    await page.screenshot({ path: name, fullPage: false });
    const status = errs.length ? JSON.stringify(errs.slice(0, 2)) : "CLEAN";
    console.log(`${label} ${r.padEnd(18)} -> ${page.url().replace(base, "") || "/"}  ${status}`);
  }
  await page.close();
}

const STUDENT_ROUTES = ["/", "/checkin", "/homepage", "/cases", "/cases/C001", "/flashcards", "/summary", "/progress", "/profile", "/chat"];
const ADMIN_ROUTES = ["/admin", "/admin/students", "/admin/accounts", "/admin/activity"];
const SUPERVISOR_ROUTES = ["/supervisor"];

const browser = await chromium.launch();
if (only.length > 0) {
  const ctx = await seededContext(browser, base, student);
  await sweep(ctx, only, "custom ");
  await ctx.close();
} else {
  // Login page in a clean (signed-out) context so it doesn't redirect
  const clean = await seededContext(browser, base, null);
  await clean.route("**/api/auth/me", (r) => r.fulfill(J({ error: "unauthenticated" }, 401)));
  await sweep(clean, ["/"], "public ");
  await clean.close();

  const sctx = await seededContext(browser, base, student);
  await sweep(sctx, STUDENT_ROUTES.slice(1), "student");
  await sctx.close();

  const supctx = await seededContext(browser, base, { ...student, role: "supervisor" });
  await sweep(supctx, SUPERVISOR_ROUTES, "superv ");
  await supctx.close();

  const actx = await seededContext(browser, base, admin);
  await sweep(actx, ADMIN_ROUTES, "admin  ");
  await actx.close();
}
await browser.close();
console.log("sweep complete");
