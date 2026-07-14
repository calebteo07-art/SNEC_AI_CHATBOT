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
  await p.waitForSelector(".studio-hero .eyecon-layer", { timeout: 12000 });
  if ((await p.locator(".studio-skip").count()) === 0) ok("gate — welcome Studio has no 'Skip for now' escape");
  else fail("gate — a Skip button still exists in the welcome Studio");
  if ((await p.locator("text=Skip for now").count()) === 0) ok("gate — no 'Skip for now' copy anywhere");
  else fail("gate — 'Skip for now' copy still present");
  await ctx.close();
}

// ── C) INSTANT PREVIEW: tapping a feature tile adds/updates that overlay layer on the
//        hero composite, live (no portrait render needed). ────────────────────────────
{
  const ctx = await studentCtx(false);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/studio?welcome=1`, { waitUntil: "networkidle" });
  await p.waitForSelector(".studio-hero .eyecon-layer", { timeout: 12000 });
  const before = await p.locator('.studio-hero .eyecon-layer[src^="/avatar/overlay/topper/"]').count();
  await p.locator('.studio-dot[aria-label*="On top"]').click();
  await p.waitForTimeout(250);
  await p.locator('.studio-tile:has(.studio-tile-label:text-is("Crown"))').click();
  await p.waitForTimeout(400);
  const after = await p.locator('.studio-hero .eyecon-layer[src="/avatar/overlay/topper/crown.webp"]').count();
  if (before === 0 && after >= 1) {
    ok("instant preview — hero grew a crown topper layer on tile tap");
  } else {
    fail(`instant preview — hero did not add the crown overlay layer (before=${before} after=${after})`);
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

// ── F) HOME POPOVER: the customized Eyecon button opens change-password + log-out. ────
{
  const ctx = await studentCtx(true);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await p.waitForSelector(".hm-eyeconmenu-btn", { timeout: 12000 });
  // the button renders the Eyecon composite (at least the body layer)
  if ((await p.locator(".hm-eyeconmenu-btn .eyecon-layer").count()) >= 1) ok("home — top-right button renders the customized Eyecon");
  else fail("home — Eyecon button missing its avatar");
  await p.locator(".hm-eyeconmenu-btn").click();
  await p.waitForSelector('[data-testid="eyecon-menu"]', { timeout: 6000 });
  const pop = p.locator('[data-testid="eyecon-menu"]');
  const hasPw = (await pop.locator("text=Change password").count()) >= 1;
  const hasOut = (await pop.locator("text=Log out").count()) >= 1;
  if (hasPw && hasOut) ok("home — Eyecon popover shows Change password + Log out");
  else fail(`home — popover missing items (pw=${hasPw} logout=${hasOut})`);
  await ctx.close();
}

// ── G) LEADERBOARD has no "Edit Eyecon/Selena" control (re-customization is gone). ─────
{
  const ctx = await studentCtx(true);
  await ctx.route("**/api/leaderboard*", (r) => r.fulfill(J({
    entries: [
      { rank: 1, name: "Aisha R.", role: "OT", xp: 12480, level: 24, streak_days: 31, avatar_config: { topper: "crown", background: "galaxy" }, portrait_url: null, is_you: false },
      { rank: 2, name: "You", role: "OA", xp: 7660, level: 17, streak_days: 9, avatar_config: { background: "peach" }, portrait_url: null, is_you: true },
    ],
    you_hidden: false, display_name: null, roles: ["OA", "OT"],
  })));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/leaderboard`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-testid="podium"], .lb-row', { timeout: 12000 }).catch(() => {});
  if ((await p.locator('[data-testid="edit-selena"]').count()) === 0) ok("leaderboard — no legacy edit-selena control");
  else fail("leaderboard — an edit-selena control still exists");
  if ((await p.locator("text=Edit Selena").count()) === 0 && (await p.locator("text=Edit Eyecon").count()) === 0) ok("leaderboard — no 'Edit Eyecon/Selena' copy");
  else fail("leaderboard — 'Edit' Eyecon/Selena copy still present");

  // Task 6 end-to-end: the rank-1 entry has topper:"crown" + no portrait, so the <Eyecon>
  // composite must render a crown topper overlay layer (keyless-safe customized look, no
  // AI portrait needed).
  const srcs = await p.locator(".lb-ped-face .eyecon-layer, .lb-face .eyecon-layer").evaluateAll(
    (els) => els.map((e) => e.getAttribute("src")),
  );
  if (srcs.some((s) => (s ?? "").includes("/avatar/overlay/topper/crown.webp"))) {
    ok("leaderboard — Eyecon composite renders the customized topper layer from avatar_config (no portrait)");
  } else {
    fail(`leaderboard — composite topper layer not rendered (srcs=${JSON.stringify(srcs)})`);
  }
  await ctx.close();
}

await browser.close();
if (process.exitCode) console.error("\neyecon_assert: FAILURES above");
else console.log("\neyecon_assert: all gate/lock/preview/surface assertions passed");
