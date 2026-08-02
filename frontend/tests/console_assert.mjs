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
    } catch {
      fails.push(`${href} did not render ${sel}`);
    }
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
