/* Eyecon feature harness — the mandatory unskippable first-login gate, unlimited edit-anytime
   re-editing, instant Studio preview, and surface restriction. Serve the standalone build on
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

// ── C) LIBRARY PICK: the Studio is a fixed preset gallery — tapping a tile makes it the
//        hero (one pre-baked image) and arms Save. ──────────────────────────────────────
{
  const ctx = await studentCtx(false);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/studio?welcome=1`, { waitUntil: "networkidle" });
  await p.waitForSelector(".studio-hero .eyecon-layer", { timeout: 12000 });
  const cards = await p.locator(".lib-card").count();
  if (cards > 50) ok(`library — gallery renders the full pre-generated tile set (${cards} cards)`);
  else fail(`library — gallery too small (${cards} cards)`);
  await p.locator('.lib-card[data-ref="outfit/cape"]').click();
  await p.waitForTimeout(300);
  const heroCape = await p.locator('.studio-hero .eyecon-layer[src="/avatar/tiles/outfit/cape.webp"]').count();
  const saveArmed = await p.locator(".studio-save:not([disabled])").count();
  if (heroCape >= 1 && saveArmed >= 1) {
    ok("library — picking a tile swaps the hero to that baked look and arms Save");
  } else {
    fail(`library — pick did not update the hero/Save (hero=${heroCape} saveArmed=${saveArmed})`);
  }
  await ctx.close();
}

// ── D) EDIT ANYTIME: a customized student CAN re-open the Studio and remix (no lock). ──
{
  const ctx = await studentCtx(true);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
  await p.waitForSelector(".lib-grid .lib-card", { timeout: 12000 }).catch(() => {});
  const cards = await p.locator(".lib-card").count();
  if (/\/studio/.test(p.url()) && cards > 50) ok(`edit-anytime — customized student re-opens /studio (library renders ${cards} cards, no bounce)`);
  else fail(`edit-anytime — customized student could NOT re-open /studio (url=${p.url()} cards=${cards})`);

  // E) …and a customized student navigates the app normally (not gated).
  await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  if (/\/dashboard/.test(p.url())) ok("edit-anytime — customized student reaches /dashboard normally (not gated)");
  else fail(`edit-anytime — customized student wrongly redirected off /dashboard (url=${p.url()})`);
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

  // edit-anytime: the popover offers an "Edit Eyecon" entry (students included) that opens the Studio.
  const hasEdit = (await pop.locator("text=Edit Eyecon").count()) >= 1;
  if (hasEdit) ok("home — Eyecon popover offers 'Edit Eyecon' for the student (edit anytime)");
  else fail("home — 'Edit Eyecon' entry missing for the student");
  await pop.locator("text=Edit Eyecon").click();
  await p.waitForURL(/\/studio/, { timeout: 12000 }).catch(() => {});
  if (/\/studio/.test(p.url())) ok("home — 'Edit Eyecon' routes the student into /studio (no lock)");
  else fail(`home — 'Edit Eyecon' did not open /studio (url=${p.url()})`);
  await ctx.close();
}

// ── G) LEADERBOARD has no "Edit Eyecon/Selena" control (re-customization is gone). ─────
{
  const ctx = await studentCtx(true);
  // rank-1 carries a STALE portrait_url (the retired 3D-portrait cache) alongside a real
  // avatar_config: the composited Eyecon is canonical now, so the board must render the
  // config-driven composite and IGNORE the stale portrait (regression: it used to win).
  const STALE_PORTRAIT = "https://cdn.example/stale-retired-portrait.webp";
  await ctx.route("**/api/leaderboard*", (r) => r.fulfill(J({
    entries: [
      { rank: 1, name: "Aisha R.", role: "OT", xp: 12480, level: 24, streak_days: 31, avatar_config: { topper: "crown", background: "galaxy" }, portrait_url: STALE_PORTRAIT, is_you: false },
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

  // Task 6 + regression: rank-1 has topper:"crown" AND a stale portrait_url. The <Eyecon>
  // composite must render the crown topper overlay layer from avatar_config, and must NOT
  // fall back to the stale retired portrait image.
  const srcs = await p.locator(".lb-ped-face .eyecon-layer, .lb-face .eyecon-layer").evaluateAll(
    (els) => els.map((e) => e.getAttribute("src")),
  );
  if (srcs.some((s) => (s ?? "").includes("/avatar/overlay/topper/crown.webp"))) {
    ok("leaderboard — Eyecon composite renders the customized topper layer from avatar_config");
  } else {
    fail(`leaderboard — composite topper layer not rendered (srcs=${JSON.stringify(srcs)})`);
  }
  if (!srcs.some((s) => (s ?? "") === STALE_PORTRAIT)) {
    ok("leaderboard — stale retired portrait_url is ignored (composite wins)");
  } else {
    fail("leaderboard — a stale portrait_url is still rendered instead of the composite");
  }
  await ctx.close();
}

await browser.close();
if (process.exitCode) console.error("\neyecon_assert: FAILURES above");
else console.log("\neyecon_assert: all gate/lock/preview/surface assertions passed");
