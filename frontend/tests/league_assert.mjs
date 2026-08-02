/* The League — behavioural gate for the Beam board (spec 2026-08-01 §6, plan 2026-08-02).

   What only a real browser can prove, and why each check exists:
   · the podium's DOM order is 1-2-3 while it PAINTS 2-1-3. The board this replaces was
     literally ordered 2-1-3, so screen readers announced second place first. Only a live
     layout can show DOM order and visual order disagreeing on purpose.
   · the scale contrast is real (champion 1.7x portrait, 2x plinth). The old podium raised
     #1 by twelve pixels; "it looks taller" is exactly the claim a unit test cannot make.
   · the promotion line lands on the right student. Off by one row and the board lies about
     who is promoted — the single most consequential pixel here.
   · ZERO baked raster on the stage. The four deleted webps are why the old podium drifted;
     this fails the moment someone reintroduces one.
   · motion freezes under BOTH reduce signals (OS pref and the in-app data-motion toggle).
   · the ceremony shows once and does not come back (/ship-check: state invariants need the
     repeat case covered behaviourally, not just in pytest).

   Run:  node frontend/tests/league_assert.mjs [base]
*/
import { chromium } from "playwright";
import { student, seededContext, J } from "./_mocks.mjs";
import { VIEWPORTS, DESKTOP } from "./_viewports.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
let failed = 0;
const ok = (m) => console.log("PASS:", m);
const bad = (m) => { console.error("FAIL:", m); failed++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* A 30-person division with the top 7 promoting — Duolingo's shape, and the shape the
   backend actually produces (promote_count(30) === 7). The viewer sits at rank 12, below
   the line, which is the case the whole redesign exists for. `rank_delta` deliberately
   covers all four states: climbed, fell, unchanged, and NO SNAPSHOT (null). */
const NAMES = ["Aisha R.", "Wei Jie T.", "Priya N.", "Marcus L.", "Siti N.", "Daniel O.",
  "Farah K.", "Jun Hao L.", "Nadia B.", "Ethan C.", "Mei Ling W.", "You", "Rohan D.",
  "Kavya S.", "Tan Wei Ming Alexander", "Zoe H.", "Ibrahim A.", "Lucas P.", "Hui Xin C.",
  "Arjun M.", "Grace L.", "Yusuf R.", "Chloe T.", "Devi N.", "Sam K.", "Ling Ling F.",
  "Omar J.", "Bea V.", "Tariq S.", "Elin G."];
const ENTRIES = NAMES.map((name, i) => ({
  rank: i + 1,
  name,
  role: i % 2 ? "OA" : "OT",
  xp: 9800 - i * 310,
  xp_total: 40000 - i * 900,
  level: 30 - i,
  streak_days: (i * 3) % 24,
  avatar_config: i % 3 === 0 ? { background: "galaxy" } : null,
  is_you: name === "You",
  division: 2,
  // i===4 (rank 5) is null ON PURPOSE and must stay in the LIST, not the podium: the
  // "no snapshot" arrow is only observable on a ranked row, and an earlier version of this
  // fixture put the only null on rank 1 — so the check below passed while testing nothing.
  rank_delta: i === 0 || i === 4 ? null : i % 4 === 1 ? 3 : i % 4 === 2 ? -2 : 0,
}));

const BOARD = {
  entries: ENTRIES, you_hidden: false, display_name: null, roles: ["OA", "OT"],
  division: 2, division_name: "Silver", pool_size: 30, promote_count: 7,
};
const PROMOTE = BOARD.promote_count;

async function boardCtx(b, vp, { board = BOARD, result = null, extra = {} } = {}) {
  const ctx = await seededContext(b, base, student, { width: vp.width, height: vp.height },
    { ...(vp.touch ? { hasTouch: true, isMobile: true } : {}), ...extra });
  // Registered AFTER seededContext so these win over the catch-all (last route wins).
  await ctx.route("**/api/leaderboard**", (r) => {
    if (r.request().method() === "POST") return r.fulfill(J({ ok: true }));
    return r.fulfill(J(board));
  });
  // No ceremony by default: a full-screen overlay would swallow every other click here.
  await ctx.route("**/api/league/result", (r) => r.fulfill(J(result ?? { result: null })));
  await ctx.route("**/api/league/result/seen", (r) => r.fulfill(J({ ok: true })));
  return ctx;
}

async function openBoard(ctx) {
  const p = await ctx.newPage();
  await p.goto(base + "/leaderboard", { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-testid="podium-slot"]', { timeout: 20000 });
  await p.waitForFunction(() => {
    const finite = document.getAnimations().filter((a) => {
      const t = a.effect?.getComputedTiming?.();
      return typeof a.animationName === "string" && (!t || t.iterations !== Infinity);
    });
    return finite.every((a) => a.playState === "finished" || a.playState === "idle");
  }, null, { timeout: 15000 });
  // The board auto-scrolls to your row ~900ms in. Settle it, then return to the top so
  // geometry is measured against a known scroll position.
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector(".aurora-main-scroll")?.scrollTo(0, 0));
  return p;
}

const measure = (p) => p.evaluate(() => {
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const one = (s) => { const el = document.querySelector(s); return el ? R(el) : null; };
  const all = (s) => [...document.querySelectorAll(s)].map(R);
  const vw = document.documentElement.clientWidth;

  const over = [];
  for (const el of document.querySelectorAll(".lb-climb, .lb-climb *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) over.push({ cls: (el.className || "").toString().slice(0, 40), left: +r.left.toFixed(1), right: +r.right.toFixed(1) });
  }

  const targets = [...document.querySelectorAll(".lb-climb button, .lb-climb a, .lb-climb input")]
    .map((el) => { const r = el.getBoundingClientRect(); return { cls: (el.className || "").toString().slice(0, 26), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; });

  // Zero-raster proof: no element ON THE STAGE may paint a bitmap. Student portraits are
  // <img>, which is legitimate — this only forbids CSS background images, which is what the
  // four deleted webps were and the only way the old overlay-vs-art drift could return.
  const rasters = [];
  const main = document.querySelector(".aurora-main");
  for (const el of [main, ...document.querySelectorAll(".lb-climb, .lb-climb *")]) {
    if (!el) continue;
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg.includes("url(")) rasters.push({ cls: (el.className || "").toString().slice(0, 40), bg: bg.slice(0, 70) });
  }

  const slot = (place) => {
    const el = document.querySelector(`.bm-slot[data-place="${place}"]`);
    if (!el) return null;
    const face = el.querySelector(".bm-face");
    const plinth = el.querySelector(".bm-plinth");
    return {
      place,
      x: el.getBoundingClientRect().x,
      face: face ? face.getBoundingClientRect().width : 0,
      plinth: plinth ? plinth.getBoundingClientRect().height : 0,
    };
  };

  return {
    vw, vh: window.innerHeight, over, targets, rasters,
    root: one(".lb-climb"),
    slots: [slot(1), slot(2), slot(3)].filter(Boolean),
    peds: all(".bm-slot"),
    rows: all(".lg-row"),
    names: all(".bm-name"),
    // DOM order of the plinths, and the order they actually PAINT in (left to right).
    domOrder: [...document.querySelectorAll(".bm-slot")].map((e) => e.dataset.place).join(" "),
    paintOrder: [...document.querySelectorAll(".bm-slot")]
      .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
      .map((e) => e.dataset.place).join(" "),
    rungs: [...document.querySelectorAll(".dv-rung")].map((e) => e.dataset.state),
    clock: document.querySelector('[data-testid="lb-reset"]')?.textContent?.trim() ?? null,
    // Where the promotion line sits, by the RANK of the row directly under it.
    lineNextRank: (() => {
      const line = document.querySelector('[data-testid="promotion-line"]');
      const next = line?.nextElementSibling?.querySelector(".lg-rk");
      return next ? Number(next.textContent) : null;
    })(),
    promoRanks: [...document.querySelectorAll(".lg-item[data-promo] .lg-rk")].map((e) => Number(e.textContent)),
    arrowDirs: [...document.querySelectorAll(".lg-mv")].map((e) => e.dataset.dir),
    chase: document.querySelector(".chase-n")?.textContent?.trim() ?? null,
  };
});

const b = await chromium.launch();

/* ── 1) geometry + structure, across the whole device matrix ─────────────────────────── */
for (const vp of [...VIEWPORTS, DESKTOP]) {
  const ctx = await boardCtx(b, vp);
  const p = await openBoard(ctx);
  const m = await measure(p);
  const at = `${vp.tag} ${vp.width}x${vp.height}`;

  if (m.domOrder !== "1 2 3") bad(`${at}: podium DOM order is "${m.domOrder}", expected "1 2 3" (the champion must be announced first)`);
  else ok(`${at}: podium DOM order is 1-2-3`);
  if (m.paintOrder !== "2 1 3") bad(`${at}: podium paints "${m.paintOrder}", expected "2 1 3" (champion centre)`);
  else ok(`${at}: podium paints 2-1-3, champion centre`);

  const [s1, s2] = [m.slots.find((s) => s.place === "1") ?? m.slots[0], m.slots.find((s) => s.place === "2") ?? m.slots[1]];
  const faceRatio = s2.face ? s1.face / s2.face : 0;
  const plinthRatio = s2.plinth ? s1.plinth / s2.plinth : 0;
  if (!near(faceRatio, 1.7, 0.12)) bad(`${at}: champion portrait is ${faceRatio.toFixed(2)}x the runner-up, expected ~1.7x (${s1.face}px vs ${s2.face}px)`);
  else ok(`${at}: champion portrait is ${faceRatio.toFixed(2)}x the runner-up`);
  if (!near(plinthRatio, 2.0, 0.08)) bad(`${at}: champion plinth is ${plinthRatio.toFixed(2)}x, expected ~2x (${s1.plinth}px vs ${s2.plinth}px)`);
  else ok(`${at}: champion plinth is ${plinthRatio.toFixed(2)}x the runners-up`);

  if (m.rasters.length) bad(`${at}: the stage paints ${m.rasters.length} CSS raster(s) — the zero-raster rule is broken: ` + m.rasters.slice(0, 3).map((r) => `.${r.cls} ${r.bg}`).join(" · "));
  else ok(`${at}: zero CSS rasters on the stage (pure gradient + inline SVG)`);

  if (m.over.length) bad(`${at}: ${m.over.length} element(s) escape the viewport: ` + m.over.slice(0, 4).map((o) => `.${o.cls} [${o.left}→${o.right}] vw=${m.vw}`).join(" · "));
  else ok(`${at}: nothing escapes the viewport (vw=${m.vw})`);

  if (m.peds.length !== 3) bad(`${at}: expected 3 podium slots, got ${m.peds.length}`);
  else {
    const clipped = m.peds.filter((r) => r.x < -0.5 || r.right > m.vw + 0.5);
    if (clipped.length) bad(`${at}: ${clipped.length}/3 plinths clipped`);
    else ok(`${at}: all 3 plinths fully visible`);
  }

  // The promotion line: 7 promote, 3 are on the podium, so it sits directly above rank 8
  // and exactly ranks 4-7 are tinted.
  if (m.lineNextRank !== PROMOTE + 1) bad(`${at}: promotion line sits above rank ${m.lineNextRank}, expected ${PROMOTE + 1}`);
  else ok(`${at}: promotion line sits above rank ${PROMOTE + 1} (top ${PROMOTE} promote)`);
  const wantPromo = [4, 5, 6, 7];
  if (String(m.promoRanks) !== String(wantPromo)) bad(`${at}: rows in the promotion zone are ${JSON.stringify(m.promoRanks)}, expected ${JSON.stringify(wantPromo)}`);
  else ok(`${at}: exactly ranks 4-7 are marked promoting`);

  if (m.rungs.length !== 5) bad(`${at}: division ladder has ${m.rungs.length} rungs, expected 5`);
  else if (m.rungs.filter((s) => s === "now").length !== 1) bad(`${at}: division ladder lights ${m.rungs.filter((s) => s === "now").length} rungs, expected exactly 1`);
  else ok(`${at}: division ladder shows 5 rungs with exactly one lit`);

  if (!m.clock || !/Closes in/.test(m.clock)) bad(`${at}: no countdown to the week close (got ${JSON.stringify(m.clock)})`);
  else ok(`${at}: countdown renders — "${m.clock}"`);

  // All four arrow states must be representable; "none" (no snapshot) must never be
  // collapsed into "flat" (no change).
  const dirs = new Set(m.arrowDirs);
  const missing = ["up", "down", "flat", "none"].filter((d) => !dirs.has(d));
  if (missing.length) bad(`${at}: no row rendered a "${missing.join('"/"')}" movement arrow — the fixture no longer exercises every state`);
  else ok(`${at}: movement arrows render up/down/flat/none`);

  if (vp.touch) {
    const small = m.targets.filter((t) => t.h < 44 || t.w < 44);
    if (small.length) bad(`${at}: ${small.length} sub-44px target(s): ` + small.slice(0, 5).map((t) => `.${t.cls} ${t.w}x${t.h}`).join(" · "));
    else ok(`${at}: all ${m.targets.length} board targets ≥44px`);
  }

  await ctx.close();
}

/* ── 2) the "no snapshot" arrow, which only rank 1 carries in the fixture ────────────── */
{
  const ctx = await boardCtx(b, DESKTOP);
  const p = await openBoard(ctx);
  // Rank 1 is on the podium, so put a null-delta student into the LIST to read it there.
  const noneCount = await p.evaluate(() =>
    [...document.querySelectorAll('.lg-mv[data-dir="none"]')].length);
  const glyphs = await p.evaluate(() => ({
    none: [...document.querySelectorAll('.lg-mv[data-dir="none"] span')].map((e) => e.textContent)[0] ?? null,
    flat: [...document.querySelectorAll('.lg-mv[data-dir="flat"] span')].map((e) => e.textContent)[0] ?? null,
  }));
  // Fail, don't skip, when the fixture stops producing a no-snapshot row: a check that can
  // silently test nothing is worse than no check at all.
  if (noneCount === 0) bad(`no ranked row rendered a "no snapshot" arrow — this check cannot run`);
  else if (glyphs.none === glyphs.flat) bad(`"no snapshot" and "no change" render the same glyph (${glyphs.none}) — a new student is shown a fake zero`);
  else ok(`"no snapshot" (${glyphs.none}) is distinct from "no change" (${glyphs.flat})`);
  await ctx.close();
}

/* ── 3) interactions: peek sheet, sticky you-bar ─────────────────────────────────────── */
{
  const ctx = await boardCtx(b, VIEWPORTS[1]);
  const p = await openBoard(ctx);

  await p.locator('[data-testid="lb-row"]').first().click();
  if (await p.locator('[data-testid="row-sheet"]').count() !== 1) bad("tapping a row did not open the peek sheet");
  else {
    await p.keyboard.press("Escape");
    await p.waitForTimeout(150);
    if (await p.locator('[data-testid="row-sheet"]').count() !== 0) bad("the peek sheet did not close on Escape");
    else ok("row → peek sheet opens on tap and closes on Escape");
  }

  // Your row is rank 12 — scrolling to the top of a 30-row board puts it off-screen.
  await p.evaluate(() => document.querySelector(".aurora-main-scroll")?.scrollTo(0, 0));
  await p.waitForTimeout(400);
  if (await p.locator('[data-testid="youbar"]').count() !== 1) bad("the sticky you-bar is missing while your row is off-screen");
  else ok("the sticky you-bar appears while your row is off-screen");

  /* The board carries NO visibility panel (removed 2026-08-02 by request). Asserted as an
     absence rather than dropped silently: the panel has now been added and removed twice, and
     a stray re-import is the cheapest way for it to come back unnoticed. If it is ever meant
     to return, delete this check in the same commit that restores it. */
  if (await p.locator('[data-testid="lb-hide-switch"], .bs').count() !== 0) {
    bad("a visibility panel is rendering on the board — it was removed on request");
  } else ok("no visibility panel on the board");
  await ctx.close();
}

/* ── 4) motion freezes under BOTH reduce signals ─────────────────────────────────────── */
{
  // (a) the OS media query
  const ctx = await boardCtx(b, DESKTOP, { extra: { reducedMotion: "reduce" } });
  const p = await openBoard(ctx);
  const namesOf = (p) => p.evaluate(() =>
    [".bm-slot", ".bm-ray", ".lg-item", ".lb-climb"].map((s) => {
      const el = s === ".lb-climb" ? document.querySelector(s) : document.querySelector(s);
      if (!el) return `${s}:missing`;
      const cs = s === ".lb-climb" ? getComputedStyle(el, "::before") : getComputedStyle(el);
      return `${s}:${cs.animationName}`;
    }));
  const osNames = await namesOf(p);
  if (osNames.some((n) => !n.endsWith(":none"))) bad(`prefers-reduced-motion did not freeze the stage: ${osNames.join(" ")}`);
  else ok("prefers-reduced-motion freezes the beam, the plinths, the rows and the star field");

  // (b) the in-app toggle, which the OS query cannot cover
  await p.evaluate(() => { document.documentElement.dataset.motion = "reduce"; });
  const appNames = await namesOf(p);
  if (appNames.some((n) => !n.endsWith(":none"))) bad(`html[data-motion="reduce"] did not freeze the stage: ${appNames.join(" ")}`);
  else ok('html[data-motion="reduce"] freezes the stage too');
  await ctx.close();
}

/* ── 5) a cohort of one still gets a stage ───────────────────────────────────────────── */
{
  const solo = { ...BOARD, entries: [{ ...ENTRIES[0], name: "You", is_you: true, rank: 1, rank_delta: null }],
                 pool_size: 1, promote_count: 0 };
  const ctx = await boardCtx(b, VIEWPORTS[1], { board: solo });
  const p = await openBoard(ctx);
  const slots = await p.locator('[data-testid="podium-slot"]').count();
  const line = await p.locator('[data-testid="promotion-line"]').count();
  if (slots !== 3) bad(`a cohort of one rendered ${slots} podium slots, expected 3 (two open)`);
  else ok("a cohort of one still renders all three places");
  if (line !== 0) bad("a cohort of one drew a promotion line — nobody can be promoted out of a pool of one");
  else ok("no promotion line when promote_count is 0");
  await ctx.close();
}

/* ── 6) the promotion line is NOT drawn on a role-filtered view ──────────────────────── */
{
  const ctx = await boardCtx(b, DESKTOP);
  const p = await openBoard(ctx);
  if (await p.locator('[data-testid="promotion-line"]').count() !== 1) bad("no promotion line on the unfiltered board");
  else {
    await p.locator('.lb-filter .lb-chip:has-text("OT")').click();
    await p.waitForTimeout(500);
    if (await p.locator('[data-testid="promotion-line"]').count() !== 0) {
      bad("the promotion line survived a role filter — promote_count describes the whole division, so a filtered line points at the wrong student");
    } else ok("the promotion line is withheld on a role-filtered view");
  }
  await ctx.close();
}

/* ── 7) the ceremony: it fires, and it does NOT come back ────────────────────────────── */
{
  const RESULT = { week_start: "2026-07-27", outcome: "promoted", rank_final: 4, xp_final: 6120,
                   from_division_name: "Silver", to_division_name: "Gold" };
  const ctx = await seededContext(b, base, student, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await ctx.route("**/api/leaderboard**", (r) => r.fulfill(J(BOARD)));

  // The server burns the flag on POST /seen — model exactly that, so this proves the
  // real show-once contract and not a client-side guess.
  let burned = false;
  const seenPosts = [];
  await ctx.route("**/api/league/result", (r) => r.fulfill(J(burned ? { result: null } : RESULT)));
  await ctx.route("**/api/league/result/seen", (r) => { burned = true; seenPosts.push(r.request().postData()); return r.fulfill(J({ ok: true })); });

  const p = await ctx.newPage();
  await p.goto(base + "/leaderboard", { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-testid="league-result"]', { timeout: 20000 });
  ok("the ceremony fires for a closed week that hasn't been seen");

  const verdict = await p.locator(".lr-verdict").textContent();
  const to = await p.locator(".lr-to").count();
  if (!/Promoted/i.test(verdict ?? "")) bad(`the promotion ceremony reads "${verdict}", expected "Promoted"`);
  else if (to !== 1) bad("the promotion ceremony did not name the division being entered");
  else ok(`the ceremony names the promotion — "${verdict}" → Gold`);

  await p.locator('[data-testid="league-result-go"]').click();
  await p.waitForTimeout(400);
  if (!seenPosts.length) bad("dismissing the ceremony did not POST /api/league/result/seen");
  else if (!/2026-07-27/.test(seenPosts[0])) bad(`the seen POST carried ${seenPosts[0]}, expected the closed week 2026-07-27`);
  else ok("dismissing the ceremony marks that WEEK seen server-side");
  if (await p.locator('[data-testid="league-result"]').count() !== 0) bad("the ceremony stayed on screen after Continue");
  else ok("the ceremony clears on Continue");

  // THE REPEAT CASE (/ship-check): a fresh load must not re-show it.
  const p2 = await ctx.newPage();
  await p2.goto(base + "/leaderboard", { waitUntil: "domcontentloaded" });
  await p2.waitForSelector('[data-testid="podium-slot"]', { timeout: 20000 });
  await p2.waitForTimeout(700);
  if (await p2.locator('[data-testid="league-result"]').count() !== 0) bad("the ceremony re-fired on a second load — the show-once invariant is broken");
  else ok("the ceremony does not re-fire on a second load (show-once holds)");
  await ctx.close();
}

await b.close();
if (failed) { console.error(`\n${failed} LEAGUE ASSERTION(S) FAILED`); process.exit(1); }
console.log("\nALL LEAGUE ASSERTIONS PASSED");
