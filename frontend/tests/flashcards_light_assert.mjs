/* Flashcards "Light Arcade" — the ground is LIGHT on all four surfaces, and every
 * text/background pair on it still meets WCAG AA.
 *
 * Spec: docs/superpowers/specs/2026-08-11-flashcards-light-arcade-design.md
 *
 * Two things are gated here, and they pull in opposite directions — which is the point.
 * Inverting the ground is easy; keeping the neon arcade palette READABLE on it is the
 * part that regresses silently. `--fc-coin` #ffd21e is ~1.4:1 on white and it is the
 * giant title colour AND the HUD score colour; `--fc-green` #2ee85a is ~1.7:1. The
 * existing flashcards harnesses compare colours for DIFFERENCE and never for contrast,
 * so nothing in CI would have caught shipping either one onto a light plate.
 *
 * 1. GROUND — every colour stop of the ground on selection, intro, study and results is
 *    light. Four surfaces, not one: the 2026-07-12 lock exists because a bright→dark jump
 *    mid-flow is the specific defect that got reported, and inverting only some surfaces
 *    reintroduces it in mirror image.
 * 2. CONTRAST — a SWEEP, not a handful of hand-picked probes. Every element carrying its
 *    own visible text inside .flash-root is measured, so a surface I did not think to
 *    name still gets checked.
 *
 * Usage (server already warm — see /harness):
 *   node frontend/tests/flashcards_light_assert.mjs http://127.0.0.1:3000
 */
import assert from "node:assert";
import { chromium } from "playwright";
import { seededContext, student, J } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3000";

/* A ground stop must be at least this light. 0.5 would admit mid-grey and call the job
   done; the design is a near-white warm ground, and the darkest stop of a near-white
   ramp still clears 0.6 comfortably. */
const GROUND_MIN_L = 0.6;

/* One single-choice card with no self-mark, so the deck reaches RESULTS in one answer.
   The shared mock's second card sets requires_explanation, which detours into the
   self-mark flow and never gets us to the results screen. */
const ONE_CARD = [{
  card_id: "L1",
  stem: "Normal IOP range?",
  options: ["10-21 mmHg", "0-9 mmHg", "22-30 mmHg", "31-40 mmHg"],
  correct: [0],
  qtype: "single", kind: "theory",
  explanation: "Normal IOP is 10-21 mmHg.",
  requires_explanation: false, topic_tag: "iop_nct", difficulty: "easy",
  repetitions: 0, easiness: 2.5, interval_days: 1,
}];

/* ── colour ────────────────────────────────────────────────────────────────────────
   Everything below runs in the PAGE, injected as one source string. */
const PROBE = `
/* Chrome does NOT normalise every computed colour to rgb(). A color-mix() resolves to
   color(srgb 0.1 0.2 0.3) with channels in 0-1, and a previous harness on this repo
   read those as 0-255 and silently measured near-black as near-white. Parse both. */
function parseColor(s) {
  if (!s || s === "none" || s === "transparent") return null;
  let m = s.match(/^rgba?\\(([^)]+)\\)/);
  if (m) {
    const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some(Number.isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  m = s.match(/^color\\(srgb\\s+([^)]+)\\)/);
  if (m) {
    const p = m[1].split(/[\\s\\/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some(Number.isNaN)) return null;
    return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
  }
  return null;
}

/* Every colour literal inside a gradient string, in order. */
function gradientStops(img) {
  if (!img || img === "none") return [];
  return (img.match(/rgba?\\([^)]+\\)|color\\(srgb[^)]+\\)/g) || [])
    .map(parseColor).filter(Boolean);
}

/* WCAG 2.x relative luminance. The divisor is 1.055 — 2.055 is a typo that silently
   compresses every channel and reports dark-on-bright-green as 3.2:1 when it is 10:1.
   Sanity anchors if this is ever touched again: white 1.0, black 0.0, #767676 on white
   is exactly the 4.5:1 threshold. */
function relLum({ r, g, b }) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function over(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a),
           b: fg.b * a + bg.b * (1 - a), a: 1 };
}

function contrast(a, b) {
  const l1 = relLum(a), l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/* The effective background behind an element: walk up compositing every layer.
   A raster background (a topic photo) makes the answer a PIXEL, not a colour, so it is
   reported as indeterminate rather than guessed at — those captions carry their own
   scrim and text-shadow and are out of this gate's reach.
   A gradient is handled honestly by taking its WORST stop: a gradient only ever
   interpolates between its stops, so the worst stop bounds the worst pixel. */
function effectiveBg(el) {
  let acc = null;                       // accumulated translucent stack, front to back
  /* A translucent gradient whose OWN element has no opaque colour under it is a scrim
     laid over something this walk cannot see — the topic photo is a SIBLING element, not
     an ancestor background, so compositing would sail straight past it and report the
     page ground. That answer looks precise and is wrong, which is worse than no answer.
     A wash in the same background shorthand as an opaque colour (.flash-intro) is NOT
     this case and stays measurable.
     NB: this whole PROBE block is a template literal — no raw backticks in here. */
  let scrimmed = false;
  for (let n = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const img = cs.backgroundImage;
    let ownOpaque = false;
    if (img && img !== "none") {
      if (/url\\(/.test(img)) return { indeterminate: "image" };
      const stops = gradientStops(img);
      if (stops.length) {
        // worst = the stop that would give the LEAST contrast against our text later;
        // we cannot know the text yet, so return every stop and let the caller test all.
        const opaque = stops.filter((s) => s.a >= 0.999);
        if (opaque.length) {
          if (scrimmed) return { indeterminate: "scrim" };
          const under = acc ? acc : null;
          return { stops: opaque.map((s) => (under ? over(under, s) : s)) };
        }
        // translucent gradient (a wash) — fold its darkest stop into the stack and keep going
        const st = stops[0];
        acc = acc ? over(acc, st) : st;
        const own = parseColor(cs.backgroundColor);
        ownOpaque = !!(own && own.a >= 0.999);
        if (!ownOpaque) scrimmed = true;
      }
    }
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a > 0) {
      if (bg.a >= 0.999) {
        if (scrimmed && !ownOpaque) return { indeterminate: "scrim" };
        return { stops: [acc ? over(acc, bg) : bg] };
      }
      acc = acc ? over(acc, bg) : bg;
    }
  }
  if (scrimmed) return { indeterminate: "scrim" };
  // nothing opaque all the way up — the canvas is white
  const white = { r: 255, g: 255, b: 255, a: 1 };
  return { stops: [acc ? over(acc, white) : white] };
}

/* WCAG AA: 3:1 for large text (>=24px, or >=18.66px at weight >=700), else 4.5:1. */
function required(cs) {
  const size = parseFloat(cs.fontSize);
  const weight = parseInt(cs.fontWeight, 10) || 400;
  const large = size >= 24 || (size >= 18.66 && weight >= 700);
  return large ? 3 : 4.5;
}

function visible(el) {
  const cs = getComputedStyle(el);
  if (cs.visibility === "hidden" || cs.display === "none") return false;
  if (parseFloat(cs.opacity) < 0.05) return false;
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

/* Elements holding their OWN text (a direct non-empty text node) — so a wrapper is not
   blamed for its child's colours. */
function textElements(root) {
  return [...root.querySelectorAll("*")].filter((el) => {
    if (!visible(el)) return false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim().length > 1) return true;
    }
    return false;
  });
}

/* The colour maths is the whole gate: if it is wrong, every assertion below is wrong in
   the same direction and the run still goes green. It HAS been wrong once (a 2.055 for a
   1.055 reported 10:1 as 3.2:1), so it now proves itself against published anchors before
   measuring anything. */
window.__fcSelfTest = function () {
  const W = { r: 255, g: 255, b: 255, a: 1 }, K = { r: 0, g: 0, b: 0, a: 1 };
  const GREY = { r: 118, g: 118, b: 118, a: 1 };   // #767676 — exactly 4.5:1 on white
  return {
    whiteOnBlack: contrast(W, K),                   // 21
    greyOnWhite: contrast(GREY, W),                 // 4.54
    whiteLum: relLum(W),                            // 1
    blackLum: relLum(K),                            // 0
    parsedSrgb: parseColor("color(srgb 0 0 0)"),    // must be 0-255 black, not white
  };
};

window.__fcGround = function () {
  const root = document.querySelector(".flash-root");
  if (!root) return { error: "no .flash-root" };
  const cs = getComputedStyle(root);
  const stops = [...gradientStops(cs.backgroundImage)];
  const bg = parseColor(cs.backgroundColor);
  if (bg && bg.a > 0) stops.push(bg);
  return { stops: stops.map((s) => ({ css: \`rgb(\${Math.round(s.r)}, \${Math.round(s.g)}, \${Math.round(s.b)})\`, lum: relLum(s) })) };
};

window.__fcContrast = function () {
  const root = document.querySelector(".flash-root");
  if (!root) return { error: "no .flash-root" };
  const bad = [], skipped = [];
  for (const el of textElements(root)) {
    const cs = getComputedStyle(el);
    const fgRaw = parseColor(cs.color);
    if (!fgRaw) continue;
    const bgInfo = effectiveBg(el);
    const label = (el.className && String(el.className).trim().split(/\\s+/)[0]) || el.tagName.toLowerCase();
    const text = (el.textContent || "").trim().slice(0, 40);
    if (bgInfo.indeterminate) { skipped.push({ label, text, why: bgInfo.indeterminate }); continue; }
    const need = required(cs);
    // Test EVERY stop; the worst one is the worst pixel the text can sit on.
    let worst = Infinity, worstBg = null;
    for (const s of bgInfo.stops) {
      const fg = fgRaw.a >= 0.999 ? fgRaw : over(fgRaw, s);
      const c = contrast(fg, s);
      if (c < worst) { worst = c; worstBg = s; }
    }
    if (worst < need) {
      bad.push({ label, text, ratio: Math.round(worst * 100) / 100, need,
        fg: cs.color, bg: \`rgb(\${Math.round(worstBg.r)}, \${Math.round(worstBg.g)}, \${Math.round(worstBg.b)})\`,
        size: cs.fontSize, weight: cs.fontWeight });
    }
  }
  return { bad, skipped };
};
`;

/* ── run ───────────────────────────────────────────────────────────────────────── */
const b = await chromium.launch();
const ctx = await seededContext(b, base, student, undefined, { reducedMotion: "reduce" });
await ctx.route("**/api/flashcards/generate*", (r) =>
  r.fulfill(J(ONE_CARD)));
const page = await ctx.newPage();
await page.addInitScript(PROBE);

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failures += 1; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

const surfaces = [];
async function capture(surface) {
  const ground = await page.evaluate(() => window.__fcGround());
  const contrast = await page.evaluate(() => window.__fcContrast());
  assert.ok(!ground.error, `${surface}: ${ground.error}`);
  assert.ok(!contrast.error, `${surface}: ${contrast.error}`);
  surfaces.push({ surface, ground, contrast });
}

console.log("flashcards_light_assert:");

// ── 0. The measuring instrument, before anything is measured with it.
await page.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
await check("the contrast maths is correct (WCAG anchors)", async () => {
  const t = await page.evaluate(() => window.__fcSelfTest());
  const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) < tol,
    `${what}: expected ~${want}, got ${got && got.toFixed ? got.toFixed(3) : got}`);
  near(t.whiteLum, 1, 0.001, "relative luminance of white");
  near(t.blackLum, 0, 0.001, "relative luminance of black");
  near(t.whiteOnBlack, 21, 0.05, "contrast(white, black)");
  near(t.greyOnWhite, 4.54, 0.05, "contrast(#767676, white) — the AA threshold anchor");
  assert.ok(t.parsedSrgb && t.parsedSrgb.r === 0,
    `color(srgb 0 0 0) parsed as ${JSON.stringify(t.parsedSrgb)} — 0-1 channels read as 0-255`);
});

// ── SELECTION
await page.waitForSelector('[data-testid="flash-setup"]', { timeout: 25000 });
await page.waitForTimeout(400);
await capture("selection");

// ── INTRO
const fan = await page.locator(".fan-stage").boundingBox();
await page.mouse.click(Math.round(fan.x + fan.width / 2), Math.round(fan.y + fan.height / 2));
await page.waitForSelector('[data-testid="flash-intro"]', { timeout: 15000 });
await page.waitForTimeout(300);
await capture("intro");

// ── STUDY
await page.locator('[data-testid="flash-intro-begin"]').click();
await page.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="flash-option"]').length === 4,
  null, { timeout: 8000 });
await page.waitForTimeout(300);
await capture("study");

// ── REVEAL (the payoff face — its own plate, its own verdict colours)
await page.locator('[data-testid="flash-option"]').nth(0).click();
await page.waitForSelector('[data-testid="flash-payoff"]', { timeout: 10000 });
await page.waitForTimeout(600);
await capture("reveal");

// ── RESULTS
await page.locator('[data-testid="flash-advance"]').click();
await page.waitForSelector('[data-testid="flash-results"]', { timeout: 15000 });
await page.waitForTimeout(500);
await capture("results");

/* Every surface reached — a silent early exit would make the gate meaningless. */
await check("all four surfaces plus the reveal were reached", () => {
  assert.deepStrictEqual(surfaces.map((s) => s.surface),
    ["selection", "intro", "study", "reveal", "results"],
    "a surface was skipped — the flow broke before it was measured");
});

// 1. THE GROUND IS LIGHT — on every surface, at every stop.
for (const { surface, ground } of surfaces) {
  await check(`${surface}: the ground is light`, () => {
    assert.ok(ground.stops.length > 0, `${surface}: .flash-root paints no ground at all`);
    const dark = ground.stops.filter((s) => s.lum < GROUND_MIN_L);
    assert.strictEqual(dark.length, 0,
      `${surface}: ${dark.length}/${ground.stops.length} ground stop(s) are dark — `
      + dark.map((s) => `${s.css} (luminance ${s.lum.toFixed(3)})`).join(", ")
      + ` — every stop must clear ${GROUND_MIN_L}`);
  });
}

// 2. ONE GROUND, NO JUMP — the lock's core invariant, preserved through the inversion.
await check("selection → intro → study → results share one ground (no jump)", () => {
  const sig = (g) => g.stops.map((s) => s.css).join(" · ");
  const flow = surfaces.filter((s) => s.surface !== "reveal");
  const first = sig(flow[0].ground);
  for (const s of flow.slice(1)) {
    assert.strictEqual(sig(s.ground), first,
      `${s.surface} paints a different ground than selection\n      selection: ${first}\n      ${s.surface}: ${sig(s.ground)}`);
  }
});

// 3. CONTRAST SWEEP — every element carrying its own text, on every surface.
for (const { surface, contrast } of surfaces) {
  await check(`${surface}: all text meets WCAG AA`, () => {
    assert.strictEqual(contrast.bad.length, 0,
      `${surface}: ${contrast.bad.length} element(s) below AA:\n`
      + contrast.bad.map((f) =>
          `      .${f.label} "${f.text}" — ${f.ratio}:1 (needs ${f.need}:1) `
          + `fg ${f.fg} on ${f.bg} @ ${f.size}/${f.weight}`).join("\n"));
  });
}

/* Coverage is stated out loud. A sweep that silently measured two elements would pass
   just as green as one that measured forty — the count is the only thing that tells
   them apart. */
const measured = surfaces.map((s) =>
  `${s.surface}: ${s.contrast.bad.length} bad, ${s.contrast.skipped.length} over imagery`);
console.log(`\n  swept — ${measured.join(" | ")}`);
for (const { surface, contrast } of surfaces) {
  for (const s of contrast.skipped) {
    console.log(`  · ${surface}: .${s.label} "${s.text}" not measurable (over ${s.why})`);
  }
}

await ctx.close();
await b.close();

if (failures) {
  console.error(`\nflashcards_light_assert: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nflashcards_light_assert: all assertions passed");
