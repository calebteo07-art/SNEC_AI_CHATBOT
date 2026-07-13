/* Eyecon feature harness — the mandatory unskippable first-login gate, re-customization
   lock, instant Studio preview, and surface restriction. Serve the standalone build on
   :3000 first (scripts/start-harness.sh serve), then:
     node frontend/tests/eyecon_assert.mjs http://127.0.0.1:3000
   Uses the shared Playwright mocks; overrides the avatar route per test to drive customized. */
import { chromium } from "playwright";
import { J, student, avatarConfig, seededContext } from "./_mocks.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { console.error(`FAIL: ${m}`); process.exitCode = 1; };

const browser = await chromium.launch();

/** A seeded student context whose /api/avatar reports the given `customized` flag. */
async function studentCtx(customized) {
  const ctx = await seededContext(browser, BASE, { ...student }, { width: 402, height: 880 });
  await ctx.route("**/api/avatar", (r) => r.request().method() === "PUT"
    ? r.fulfill(J({ config: avatarConfig }))
    : r.fulfill(J({ config: avatarConfig, axes: {}, portrait_status: "none", portrait_url: null, customized })));
  return ctx;
}

// ── A) MANDATORY GATE: a never-customized student is forced into the welcome Studio and
//        cannot reach any feature page until they save. ────────────────────────────────
{
  const ctx = await studentCtx(false);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await p.waitForURL(/\/studio\?welcome=1/, { timeout: 12000 }).catch(() => {});
  if (/\/studio\?welcome=1/.test(p.url())) ok("gate — uncustomized student on /dashboard is forced to /studio?welcome=1");
  else fail(`gate — uncustomized student was NOT forced to Studio (url=${p.url()})`);

  // and a different feature page is equally blocked
  await p.goto(`${BASE}/leaderboard`, { waitUntil: "networkidle" });
  await p.waitForURL(/\/studio/, { timeout: 12000 }).catch(() => {});
  if (/\/studio/.test(p.url())) ok("gate — uncustomized student cannot reach /leaderboard either");
  else fail(`gate — uncustomized student reached /leaderboard (url=${p.url()})`);

  // B) the welcome Studio has NO skip/escape — Save is the only way out.
  await p.goto(`${BASE}/studio?welcome=1`, { waitUntil: "networkidle" });
  await p.waitForSelector(".studio-hero .eyecon-img", { timeout: 12000 });
  if ((await p.locator(".studio-skip").count()) === 0) ok("gate — welcome Studio has no 'Skip for now' escape");
  else fail("gate — a Skip button still exists in the welcome Studio");
  if ((await p.locator("text=Skip for now").count()) === 0) ok("gate — no 'Skip for now' copy anywhere");
  else fail("gate — 'Skip for now' copy still present");
  await ctx.close();
}

// ── C) INSTANT PREVIEW: tapping a feature tile swaps the hero image live. ──────────────
{
  const ctx = await studentCtx(false);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/studio?welcome=1`, { waitUntil: "networkidle" });
  await p.waitForSelector(".studio-hero .eyecon-img", { timeout: 12000 });
  const before = await p.locator(".studio-hero .eyecon-img").first().getAttribute("src");
  await p.locator('.studio-dot[aria-label*="On top"]').click();
  await p.waitForTimeout(250);
  await p.locator('.studio-tile:has(.studio-tile-label:text-is("Crown"))').click();
  await p.waitForTimeout(400);
  const after = await p.locator(".studio-hero .eyecon-img").first().getAttribute("src");
  if (before !== after && /\/avatar\/tiles\/topper\/crown\.webp/.test(after ?? "")) {
    ok(`instant preview — hero swapped ${before} → ${after} on tile tap`);
  } else {
    fail(`instant preview — hero did not swap (before=${before} after=${after})`);
  }
  await ctx.close();
}

// ── D) RE-CUSTOMIZATION LOCK: a customized student cannot re-enter the Studio. ─────────
{
  const ctx = await studentCtx(true);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
  await p.waitForURL(/\/dashboard/, { timeout: 12000 }).catch(() => {});
  if (/\/dashboard/.test(p.url())) ok("lock — customized student visiting /studio is redirected to /dashboard");
  else fail(`lock — customized student was NOT bounced off /studio (url=${p.url()})`);

  // E) …and a customized student navigates the app normally (not gated).
  await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  if (/\/dashboard/.test(p.url())) ok("lock — customized student reaches /dashboard normally (not gated)");
  else fail(`lock — customized student wrongly redirected off /dashboard (url=${p.url()})`);
  await ctx.close();
}

await browser.close();
if (process.exitCode) console.error("\neyecon_assert: FAILURES above");
else console.log("\neyecon_assert: all gate/lock/preview assertions passed");
