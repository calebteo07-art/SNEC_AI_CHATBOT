/* EyeBot Console harness — /admin as a full-bleed light console.
 *
 * Auto-gated: gated_harnesses() discovers any frontend/tests/*.mjs that is not
 * `_`-prefixed and imports playwright, so this needs no registration.
 *
 *   bash scripts/start-harness.sh serve
 *   node frontend/tests/console_assert.mjs
 *
 * Spec: docs/superpowers/specs/2026-08-02-admin-console-redesign-design.md §9.
 */
import { chromium } from "playwright";
import { admin, trainer, student, seededContext, MASTERY, J } from "./_mocks.mjs";

/* argv[2] FIRST — that is how start-harness.sh's run() passes the base, and it is the
   only channel that carries HARNESS_PORT. Reading the env var alone made this the one
   harness of twenty that ignored the port: a `HARNESS_PORT=3999 … all` sweep died here on
   ERR_CONNECTION_REFUSED at :3000 and aborted every harness after it. Running off-port is
   the documented way to sweep while another session owns :3000, so the trap cost a whole
   sweep and read like a product defect. The env fallback stays for direct invocations. */
const BASE = process.argv[2] ?? process.env.HARNESS_BASE ?? "http://127.0.0.1:3000";
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

const browser = await chromium.launch();

/* A "to be visible" timeout on .cs-shell is a failed app BOOT, not a slow animation.
   Report it as a FAIL line rather than letting it throw: an uncaught stack trace is
   unreadable inside the `all` sweep and buries which harness actually broke. Same
   lesson as 36bfa29 (station_assert). */
async function boot(page, path, label) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector(".cs-shell", { timeout: 15000 });
    return true;
  } catch {
    fails.push(`${label}: ${path} never booted — .cs-shell absent after 15s`);
    return false;
  }
}

/* Every visible .cs-badge at >= 4.5:1. A badge is 9.5px uppercase — SMALL text, so 4.5
   is the bar, not 3.0. This exists because the obvious implementation (hue text on a
   tint of the same hue) lands at 4.1:1 for blue and 3.97:1 for teal: plausible-looking,
   and wrong. The tint is alpha, so it is composited over white before measuring. */
async function badgeContrast(page, where) {
  const bad = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const over = (c, bg) => { const a = c.length > 3 ? c[3] : 1; return [0, 1, 2].map((i) => c[i] * a + bg[i] * (1 - a)); };
    const out = [];
    for (const el of document.querySelectorAll(".cs-badge")) {
      if (el.offsetParent === null) continue;
      const cs = getComputedStyle(el);
      const bg = over(parse(cs.backgroundColor), [255, 255, 255]);   // panels are --cs-surface
      const fg = over(parse(cs.color), bg);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      if (ratio < 4.5) out.push({ t: el.textContent.trim().slice(0, 18), r: Math.round(ratio * 100) / 100 });
    }
    return out;
  });
  check(bad.length === 0, `${where}: badges under 4.5:1 — ${JSON.stringify(bad)}`);
}

/* ─────────────────────────── desktop ─────────────────────────── */
{
  const ctx = await seededContext(browser, BASE, admin, { width: 1440, height: 900 });
  const page = await ctx.newPage();
  if (await boot(page, "/admin", "desktop")) {
  try {

  // 1. Full-bleed: the student rail must NOT be present.
  const railCount = await page.locator(".rail, .atlas-rail").count();
  check(railCount === 0, `the Atlas Rail is still rendered inside the console (${railCount} nodes)`);

  // 2. Exactly one <main> landmark. AppShell used to supply one and no longer does;
  // /admin previously shipped TWO, which hands a screen-reader user a choice of
  // "main" regions on the densest screen in the app. Zero is just as wrong.
  const mains = await page.locator("main").count();
  check(mains === 1, `expected exactly 1 <main>, found ${mains}`);

  // The shell paints before React Query resolves, so a figure read the instant
  // .cs-shell appears is ALWAYS "…". Wait for the hero to settle rather than racing
  // it — and report a stuck hero as its own failure, since "never left loading" and
  // "rendered the wrong number" are different defects.
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector("[data-testid=cs-hero-value]");
        return !!el && el.textContent.trim() !== "…";
      },
      undefined,
      { timeout: 15000 },
    );
  } catch {
    fails.push("desktop: the hero never left its loading state");
  }

  // 3. The hero renders a figure, never a bare 0 — and never an out-of-range one.
  // TrendPoint.avg_score already arrives 0-100; multiplying it by 100 renders "6800%",
  // which a mere "has digits" check waves straight through. Bound it.
  const hero = (await page.locator("[data-testid=cs-hero-value]").innerText()).trim();
  check(/\d/.test(hero) && hero !== "0", `hero rendered "${hero}"`);
  if (hero.endsWith("%")) {
    const n = Number(hero.slice(0, -1));
    check(Number.isFinite(n) && n >= 0 && n <= 100,
      `hero percentage "${hero}" is outside 0-100 — check the 0-1 vs 0-100 scale`);
  }

  // 3b. Same bound on every stat card that reads as a percentage.
  const stats = await page.locator("[data-testid=cs-stat-value]").allInnerTexts();
  for (const s of stats.map((x) => x.trim()).filter((x) => x.endsWith("%"))) {
    const n = Number(s.slice(0, -1));
    check(Number.isFinite(n) && n >= 0 && n <= 100, `stat "${s}" is outside 0-100`);
  }

  // 4. White-on-gradient hero contrast >= 4.5:1 against the DARKEST declared stop.
  const ratio = await page.evaluate(() => {
    const el = document.querySelector("[data-testid=cs-hero-value]");
    if (!el) return 0;
    const lum = (c) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
    const fg = lum(parse(getComputedStyle(el).color));
    // The hero block paints --cs-hero; #1A4FBE is its darkest stop.
    const bg = lum([26, 79, 190]);
    const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
    return (hi + 0.05) / (lo + 0.05);
  });
  check(ratio >= 4.5, `hero contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);

  // 5. Every figure either FOLLOWS the discipline segment or wears the marker. An
  // unmarked figure that silently ignores the control is the defect D11 exists to
  // prevent — only cohort-analytics and performance-trend accept the parameter.
  const marked = await page.locator("[data-testid=cs-allmark]").count();
  check(marked > 0, "no figure carries the All-disciplines marker — cohort-wide reads are unmarked");

  // 5b. The topic drill-down reads the TopicGroupRow the Overview query already
  // returned. "Progressive disclosure costs nothing" is the whole reason most-missed
  // steps became a drill-down instead of an eleventh panel — if opening one fires a
  // request, that trade is gone and the argument for cutting the panel goes with it.
  try {
    const chip = page.locator("[data-testid=cs-weakest] button.cs-btn-ghost").first();
    await chip.waitFor({ timeout: 10000 });
    const calls = [];
    const spy = (r) => { if (r.url().includes("/api/")) calls.push(new URL(r.url()).pathname); };
    page.on("request", spy);
    await chip.click();
    await page.waitForSelector("[data-testid=cs-topic-detail]", { timeout: 10000 });
    await page.waitForTimeout(900);   // give a stray fetch time to actually fire
    page.off("request", spy);
    check(calls.length === 0,
      `opening the topic drill-down fired ${calls.length} request(s): ${JSON.stringify(calls)} — it must read the already-loaded row`);
    await page.keyboard.press("Escape");
  } catch (e) {
    fails.push(`topic drill-down: ${String(e.message).split("\n")[0]}`);
  }

  // 6. Nav deep-links resolve.
  for (const [href, sel] of [
    ["/admin/students", "[data-testid=admin-roster]"],
    ["/admin/accounts", "[data-testid=cs-accounts]"],
    ["/admin/audit", "[data-testid=admin-audit]"],
  ]) {
    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
    // Each screen renders its testid only once its own read resolves, so wait rather
    // than counting immediately.
    try {
      await page.waitForSelector(sel, { timeout: 10000 });
      await badgeContrast(page, href);
    } catch {
      fails.push(`${href} did not render ${sel}`);
    }
  }

  // 7. The student drill-down — the densest surface in the console, and the one that
  // silently regressed: DivergingBar's CSS lived under .aurora-admin, a scope this
  // rebuild deletes. Unstyled, .cs-diverge-fill falls back to static position and draws
  // from the LEFT EDGE of the track, which renders every student as far below cohort.
  // A build stays green through that, so assert the GEOMETRY: an above-cohort fill
  // starts at the axis and a below-cohort fill ends at it.
  await page.goto(`${BASE}/admin/students`, { waitUntil: "domcontentloaded" });
  try {
    const row = "[data-testid=admin-roster] .cs-trow[data-clickable=true]";
    await page.waitForSelector(row, { timeout: 10000 });
    await page.locator(row).first().click();
    await page.waitForSelector("[data-testid=mastery-panel]", { timeout: 10000 });

    const rows = await page.locator("[data-testid=mastery-row]").count();
    check(rows > 0, "the drill-down opened but rendered no mastery rows");

    const drift = await page.evaluate(() => {
      const out = [];
      for (const track of document.querySelectorAll(".cs-diverge")) {
        const fill = track.querySelector(".cs-diverge-fill");
        if (!fill) continue;
        const tone = ([...fill.classList].find((c) => /^cs-diverge-(above|below|level|none)$/.test(c)) ?? "").replace("cs-diverge-", "");
        const t = track.getBoundingClientRect();
        const f = fill.getBoundingClientRect();
        if (f.width === 0 || t.width === 0) continue;   // level/none draw nothing
        const mid = t.left + t.width / 2;
        if (tone === "above" && f.left < mid - 1) out.push({ tone, offBy: Math.round(mid - f.left) });
        if (tone === "below" && f.right > mid + 1) out.push({ tone, offBy: Math.round(f.right - mid) });
        if (tone === "level" || tone === "none") out.push({ tone, offBy: "drew a bar with no magnitude" });
      }
      return out;
    });
    check(drift.length === 0, `diverging bars not anchored to the axis: ${JSON.stringify(drift)}`);

    // 8. No squashed flex children. .cs-modal is a max-height flex column, and
    // flex-shrink defaults to 1 — past 88dvh every child compresses to share the
    // deficit instead of the modal scrolling. The DOM stays correct and every test id
    // still resolves, so only geometry catches it: a child whose scrollHeight exceeds
    // its clientHeight is rendering less than it holds.
    const squashed = await page.evaluate(() =>
      [...document.querySelectorAll(".cs-modal > *")]
        .filter((el) => el.scrollHeight - el.clientHeight > 1)
        .map((el) => ({
          cls: el.className || el.tagName,
          shown: el.clientHeight,
          needs: el.scrollHeight,
        })));
    check(squashed.length === 0, `modal children squashed below their content: ${JSON.stringify(squashed)}`);

    // 9. Sub-scores carry their denominators. The column prints stored INTEGERs from two
    // scoring eras — consult/judgement were ×50 until 2026-08-04 and are 40/30/30 after —
    // so bare numbers put a student's older attempt (40·38) above their newer one (22·26)
    // and a trainer reads a collapse that is only a change of scale. Nothing about that is
    // visible to a build or a type-check, and both rows render fine either way, so assert
    // the TEXT: each era must show the maxima it was actually graded against.
    await page.getByRole("tab", { name: "Virtual patients" }).click();
    await page.waitForSelector('.cs-trow [data-label="Sub-scores"]', { timeout: 10000 });
    const subs = await page.evaluate(() =>
      [...document.querySelectorAll('.cs-trow:not(.cs-thead) [data-label="Sub-scores"]')]
        .map((el) => el.textContent.trim()));
    check(subs.includes("40/50 · 38/50"),
      `legacy ×50 attempt must render /50 denominators, got ${JSON.stringify(subs)}`);
    check(subs.includes("32/40 · 22/30 · 26/30"),
      `current attempt must render all three buckets on 40/30/30, got ${JSON.stringify(subs)}`);
    // The regression itself: two different scales must never print as one.
    check(!subs.some((s) => /^\d+·\d+$/.test(s)),
      `a sub-score rendered with no denominator at all: ${JSON.stringify(subs)}`);

    await badgeContrast(page, "student drill-down");
  } catch (e) {
    fails.push(`student drill-down: ${String(e.message).split("\n")[0]}`);
  }

  } catch (e) { fails.push(`desktop: threw — ${String(e.message).split("\n")[0]}`); }
  }
  await ctx.close();
}

/* ═════════════ role, correctness and failure behaviour ═════════════
   Migrated from aurora_assert.mjs, which owned /admin's security and correctness
   coverage and asserted it against the deleted .aurora-admin DOM. aurora_assert drives
   the STUDENT app; the console is a separate surface with its own harness, so the
   assertions move here rather than being retargeted in place. The ones tied to panels
   this rebuild deliberately cut (the safety donut, the standalone most-missed panel,
   the trend window toggle, the verbatim discipline caption) are gone with them — the
   rest are all here, retargeted at .cs. */

/* ───────────────────────── trainer ───────────────────────── */
{
  const ctx = await seededContext(browser, BASE, trainer, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  if (await boot(page, "/admin", "trainer")) {
  try {
    check(new URL(page.url()).pathname === "/admin",
      `AdminGuard bounced a TRAINER off /admin (url=${page.url()})`);

    // The a11y landmark contract the student routes get. /admin cannot join A11Y_ROUTES
    // — that sweep drives a student context and AdminGuard bounces them, so appending
    // "/admin" there would silently measure the bounce destination and report it as
    // coverage. It is the largest screen in the app and the only one a trainer uses for
    // real work, so it earns the check, not an exemption.
    const mains = await page.locator("main").count();
    const h1s = await page.locator("h1").count();
    const navs = await page.locator("nav").count();
    check(mains === 1 && h1s === 1 && navs >= 1,
      `a11y landmarks on /admin (main=${mains}, h1=${h1s}, nav=${navs})`);

    // Governance is admin-only. Presentation, not security — every write behind it is
    // re-enforced by require_admin — but a trainer must not be shown a door that 403s.
    for (const href of ["/admin/accounts", "/admin/audit"]) {
      const n = await page.locator(`.cs-nav a[href="${href}"]`).count();
      check(n === 0, `the admin-only ${href} link is exposed to a trainer`);

      // ...and hiding the link is not the same as closing the door. Typing the URL has
      // to bounce too: the routes re-guard themselves rather than relying on a nav item
      // being absent, which is the difference between a tidy menu and an access control.
      await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        (h) => location.pathname !== h, href, { timeout: 10000 },
      ).catch(() => null);
      check(new URL(page.url()).pathname !== href,
        `a TRAINER reached ${href} by typing the URL — the route does not re-guard`);
    }
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".cs-shell", { timeout: 15000 });

    await page.waitForSelector("[data-testid=risk-row]", { timeout: 15000 });

    // at_risk_count IS len(get_at_risk()) (cohort_summary.py), so the stat above the
    // list and the list itself can no longer disagree. They once did, on one screen.
    const flagged = (await page.locator('.cs-stat:has-text("Needs attention") [data-testid=cs-stat-value]').innerText()).trim();
    const riskRows = await page.locator("[data-testid=risk-row]").count();
    check(flagged === String(riskRows),
      `"Needs attention" reads ${flagged} but the list beneath it has ${riskRows} rows`);
    check(flagged === "2", `"Needs attention" = ${flagged}, expected the payload's 2`);

    // D7: the row must say WHY. A coloured band with no explanation is the old binary
    // flag wearing a pill.
    const reasons = await page.locator("[data-testid=risk-reason]").allInnerTexts();
    check(reasons.some((r) => r.includes("No activity for 20 days")),
      `no at-risk row explains why the student is flagged (got ${JSON.stringify(reasons)})`);
    // Truncated to the 3 heaviest: the fixture's row 1 carries 5 reasons, row 2 carries 1.
    check(reasons.length === 4, `expected 4 reason chips (3 capped + 1), got ${reasons.length}`);

    for (const band of ["high", "medium"]) {
      const n = await page.locator(`[data-testid=risk-band][data-band=${band}]`).count();
      check(n === 1, `at-risk ${band}-band pill missing (found ${n})`);
    }
    // The medium row carries days_inactive: null — the state that once rendered
    // "Noned inactive". It must still show a score and a reason, never a blank or a 0.
    const scores = (await page.locator("[data-testid=risk-score]").allInnerTexts()).join(" ");
    check(scores.includes("66") && scores.includes("41"),
      `at-risk scores not rendered from the payload (got ${scores})`);

    // D13, the one thing worth pinning in a BROWSER: a null bucket has to survive all
    // the way to pixels as a BREAK. The fixture is real / null / real, so a chart that
    // maps null to 0 plots THREE points and draws a cliff to the floor on any quiet day
    // — exactly the cohort collapse the endpoint refuses to report.
    const plotted = await page.evaluate(() => {
      const svg = document.querySelector('svg[aria-label="Cohort mastery trend"]');
      if (!svg) return -1;
      const poly = [...svg.querySelectorAll("polyline")].reduce(
        (n, p) => n + (p.getAttribute("points") || "").trim().split(/\s+/).filter(Boolean).length, 0);
      // r=3 marks a lone reading; the r=4.2 "latest" marker sits on top of one of them.
      const dots = [...svg.querySelectorAll("circle")].filter((c) => c.getAttribute("r") === "3").length;
      return poly + dots;
    });
    check(plotted === 2,
      `the trend plotted ${plotted} points for 2 real readings — a null bucket was drawn instead of skipped (D13)`);

    // D2/D11: the two pools are disjoint curricula, so slicing by discipline must
    // re-query. A client-side filter would leave OT trainers reading OA/PSA numbers and
    // there is no correct client-side subset. Arm the wait BEFORE the click.
    const otReq = page.waitForRequest(
      (r) => r.url().includes("/api/admin/cohort-analytics")
        && new URL(r.url()).searchParams.get("discipline") === "ot",
      { timeout: 8000 },
    ).catch(() => null);
    await page.locator("[data-testid=cs-discipline] button[data-discipline=ot]").click();
    check(!!(await otReq),
      "the discipline segment issued no /api/admin/cohort-analytics request with discipline=ot");

    // P1's core invariant: a FAILED read must never render as a measurement. "0%" beside
    // a broken endpoint reads as a real, measured, healthy cohort — on a clinical board
    // that is the most dangerous wrong number this screen can show.
    await ctx.route("**/api/admin/cohort-analytics*", (r) => r.fulfill({
      status: 500, contentType: "application/json",
      body: JSON.stringify({ detail: "Operation failed. Please try again." }),
    }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid=cs-weakest] [role=alert]", { timeout: 15000 });
    const safetyVal = (await page.locator('.cs-stat:has-text("Safety fails") [data-testid=cs-stat-value]').innerText()).trim();
    check(!/\d/.test(safetyVal),
      `a failed cohort-analytics read rendered "${safetyVal}" for Safety fails instead of a no-data marker`);

  } catch (e) { fails.push(`trainer: threw — ${String(e.message).split("\n")[0]}`); }
  }
  await ctx.close();
}

/* ───────────── admin: governance + the drill-down's stateful edges ───────────── */
{
  const ctx = await seededContext(browser, BASE, admin, { width: 1440, height: 1000 });

  // Registered AFTER seededContext so it wins (Playwright matches newest route first).
  // `masteryNull` is flipped mid-test to reach the off-cohort state without a reload.
  let detailFetches = 0;
  let masteryNull = false;
  await ctx.route("**/api/admin/student/*/detail", (r) => {
    detailFetches++;
    r.fulfill(J({
      student_id: "S001", full_name: "Test Student", email: "student@snec.com.sg", role: "OA",
      session_count: 18 + detailFetches, streak: 6,
      last_active: new Date(Date.now() + detailFetches).toISOString(),
      learning_velocity: "improving", weak_topics: [], missed_findings: [], retention_scores: {},
      supervisor_note: detailFetches === 1
        ? "Original supervisor note"
        : "SERVER NOTE FROM POLL — must never clobber a draft",
      sessions: [], cases: [], total_tokens: 1000 + detailFetches,
      mastery: masteryNull ? null : MASTERY,
    }));
  });

  const page = await ctx.newPage();
  if (await boot(page, "/admin", "admin")) {
  try {
    for (const href of ["/admin/accounts", "/admin/audit"]) {
      const n = await page.locator(`.cs-nav a[href="${href}"]`).count();
      check(n === 1, `an ADMIN is missing the ${href} link (found ${n})`);
    }

    // The clock must be installed BEFORE the query mounts — a timer scheduled via the
    // real setTimeout pre-install is never advanced by a later fastForward.
    await page.clock.install();
    await page.goto(`${BASE}/admin/students`, { waitUntil: "domcontentloaded" });
    const row = "[data-testid=admin-roster] .cs-trow[data-clickable=true]";
    await page.waitForSelector(row, { timeout: 15000 });
    await page.locator(row).first().click();

    // Regression: the note seeds from useStudentDetail, which polls every 30s. The
    // seeding effect keys off studentId (once per opened student), NOT `data` (every
    // poll) — a background refetch resolving to a new object reference must never
    // clobber a supervisor's in-progress draft. Reproduced live pre-fix: type a draft,
    // wait one real poll, draft gone.
    const noteBox = page.locator(".cs-modal textarea.cs-textarea");
    await noteBox.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(() => {
      const ta = document.querySelector(".cs-modal textarea.cs-textarea");
      return ta && ta.value === "Original supervisor note";
    }, undefined, { timeout: 10000 });
    const draft = "DRAFT — do not lose me";
    await noteBox.fill(draft);
    await page.clock.fastForward(31_000);   // past staleTime (15s) and the 30s poll
    await page.waitForTimeout(600);         // let the mocked round-trip settle (real time)
    check(detailFetches >= 2,
      `test setup never triggered a second /detail fetch (fetches=${detailFetches}) — the assertion is not meaningful`);
    const survived = await noteBox.inputValue();
    check(survived === draft,
      `the supervisor-note draft was clobbered by a background poll refetch (got "${survived}")`);

    // P2b §6.2: three NAMED scales against a leave-one-out cohort. This replaced
    // `cohort_retention`, a per-topic field the frontend read for seventeen days and no
    // backend version ever sent, so the report printed a column of dashes.
    await page.waitForSelector("[data-testid=mastery-row]", { timeout: 15000 });
    const scales = await page.locator("[data-testid=mastery-row]").count();
    check(scales === 3, `expected 3 named mastery scales, got ${scales}`);

    const osceDelta = (await page.locator('[data-testid=mastery-row][data-scale=osce_mastery] [data-testid=mastery-delta]').innerText()).trim();
    check(osceDelta === "+17", `mastery delta vs cohort = "${osceDelta}", expected +17`);
    // A scale with no student data is an em dash. A 0 there is the worst score in the cohort.
    const fcValue = (await page.locator('[data-testid=mastery-row][data-scale=flashcard_mastery] [data-testid=mastery-value]').innerText()).trim();
    check(fcValue === "—", `a scale with no student data must render an em dash, not "${fcValue}"`);
    const retCohort = await page.locator('[data-testid=mastery-row][data-scale=retention_mastery] [data-testid=mastery-cohort]').innerText();
    check(retCohort.includes("No cohort"), `a solo cohort must say so, not render a zero delta (got "${retCohort}")`);
    // peers_n, not cohort_n. cohort_n is 8 here and counts this student; the mean is over
    // 7. "8 peers" beside a mean of 7 is the exact misread peers_n was added to prevent.
    const osceCohort = await page.locator('[data-testid=mastery-row][data-scale=osce_mastery] [data-testid=mastery-cohort]').innerText();
    check(osceCohort.includes("7 peer"),
      `the cohort caption must name peers_n (7), not cohort_n (8) — got "${osceCohort}"`);

    // The block must VANISH when the API sends none. `mastery: null` is routine —
    // admin.py emits it for any student outside the staff-free cohort, and a promoted
    // trainer is on the roster and clickable. Assert on the PANEL, not the rows: without
    // the `mastery.length > 0` guard the section still renders its heading and help text
    // over an empty list, so a row count of zero passes while a trainer reads a
    // "Mastery vs cohort" panel that measures nothing.
    masteryNull = true;
    await page.clock.fastForward(31_000);
    await page.waitForFunction(
      () => !document.querySelector("[data-testid=mastery-panel]"),
      undefined, { timeout: 10000 },
    );
    check(await noteBox.isVisible(), "a null mastery block took the whole drill-down with it");

  } catch (e) { fails.push(`admin: threw — ${String(e.message).split("\n")[0]}`); }
  }
  await ctx.close();
}

/* ───────────── a student must never reach the cohort-wide surface ───────────── */
{
  const ctx = await seededContext(browser, BASE, student, { width: 1440, height: 900 });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => location.pathname !== "/admin", undefined, { timeout: 10000 })
      .catch(() => null);
    check(new URL(page.url()).pathname !== "/admin",
      "AdminGuard let a STUDENT onto /admin (cohort data leak)");
    check((await page.locator("[data-testid=cs-hero]").count()) === 0,
      "a student saw the cohort hero on /admin");
  } catch (e) { fails.push(`student bounce: threw — ${String(e.message).split("\n")[0]}`); }
  await ctx.close();
}

/* ──────────────────── phone, COARSE pointer ──────────────────── */
/* hasTouch drives (pointer: coarse). Without it the harness runs FINE-pointer and the
   phone tiers never render at all — the audit then passes without testing anything. */
{
  const ctx = await seededContext(browser, BASE, admin,
    { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  if (await boot(page, "/admin", "phone-390")) {
  try {

  // 7. No horizontal overflow at 390px.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `page overflows horizontally by ${overflow}px at 390`);

  // 8. Tap targets >= 44px, measured SETTLED — a correct 44px control reads 43.7
  // mid-transition, so this waits for the entrance animation to finish first.
  await page.waitForTimeout(700);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll(".cs-shell a, .cs-shell button")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { t: el.textContent.trim().slice(0, 24), h: Math.round(r.height * 10) / 10 };
      })
      .filter((x) => x.h > 0 && x.h < 44));
  check(small.length === 0, `tap targets under 44px: ${JSON.stringify(small)}`);

  } catch (e) { fails.push(`phone-390: threw — ${String(e.message).split("\n")[0]}`); }
  }
  await ctx.close();
}

await browser.close();

if (fails.length) {
  console.log(`console_assert: FAIL (${fails.length})`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("console_assert: all assertions passed");
