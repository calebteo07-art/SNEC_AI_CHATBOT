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
import { admin, seededContext } from "./_mocks.mjs";

const BASE = process.env.HARNESS_BASE ?? "http://127.0.0.1:3000";
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

    await badgeContrast(page, "student drill-down");
  } catch (e) {
    fails.push(`student drill-down: ${String(e.message).split("\n")[0]}`);
  }

  } catch (e) { fails.push(`desktop: threw — ${String(e.message).split("\n")[0]}`); }
  }
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
