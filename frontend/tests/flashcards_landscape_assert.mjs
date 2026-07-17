/* Flashcards topic picker — the two defects the mobile audit is structurally blind to.
 *
 * The audit measures element rects against the VIEWPORT and only horizontally. Neither
 * catches this, because `.flash-content { overflow: hidden }` clips the stage: the cards
 * are simply gone, with no scrollbar and no rect poking past the right edge. Same class
 * of blindness as `.aurora-main-scroll { overflow-x: hidden }` hiding real overflow from
 * `document.scrollWidth`. A clipping ancestor makes a bug invisible to the instrument.
 *
 * 1. THE STAGE MUST FIT. `.fan-stage` was `clamp(496px, 68dvh, 640px)` — the 496px FLOOR
 *    beats the dvh term on a landscape phone, so a 390px-tall viewport got a 496px stage
 *    and ~52% of every topic card was unreachable. `dvh` cannot save a clamp whose
 *    minimum already exceeds the viewport.
 *
 * 2. THE CARD MUST FIT ITS STAGE VERTICALLY. Horizontal spill is deliberate — the stage's
 *    `overflow: hidden` is precisely what makes the coverflow a window onto a wider ring —
 *    but a card taller than its stage is clipped at both ends, which never is.
 *
 * NOT asserted here, deliberately: that CSS and the depth projection agree on the card
 * width. They disagreed badly (JS stepped at 400/560/768/1024, CSS at a single 639px, so
 * across 640-1023px CSS drew a 348px card while the maths placed neighbours for a 326px
 * one, quietly mis-scaling a LOCKED projection). It is fixed at the root instead:
 * CardFanCarousel now MEASURES the laid-out card, so the two cannot desync. Three attempts
 * to assert it from the DOM all produced false positives on intentional design — the ring
 * drifts continuously, and the outermost card sits at gap1 + stepX*over rather than gap1,
 * so neither the largest |x| nor stage containment recovers W. A test that cannot tell the
 * bug from the design is worse than no test; the structural fix is the guard.
 */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";
import { VIEWPORTS, DESKTOP } from "./_viewports.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const fails = [];
const b = await chromium.launch();

for (const v of [...VIEWPORTS, DESKTOP]) {
  const ctx = await seededContext(
    b, base, student,
    { width: v.width, height: v.height },
    v.touch ? { hasTouch: true, isMobile: true } : {},
  );
  const p = await ctx.newPage();
  await p.goto(base + "/flashcards", { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-testid="flash-fan"]', { timeout: 25000 });
  await p.waitForTimeout(900);

  const m = await p.evaluate(() => {
    const stage = document.querySelector(".fan-stage");
    const cards = Array.from(document.querySelectorAll(".fan-card"));
    const sr = stage.getBoundingClientRect();
    const cardW = cards.length ? Math.max(...cards.map((c) => c.offsetWidth)) : null;
    const cardH = cards.length ? Math.max(...cards.map((c) => c.offsetHeight)) : null;

    return {
      vh: window.innerHeight,
      stageBottom: Math.round(sr.bottom), stageH: Math.round(sr.height),
      cardW, cardH,
    };
  });

  // 1. the stage must not extend past the fold — a clipping ancestor makes it unreachable
  if (m.stageBottom > m.vh + 1) {
    fails.push(`${v.tag} (${v.width}x${v.height}): stage bottom=${m.stageBottom} exceeds viewport ${m.vh} by ${m.stageBottom - m.vh}px — cards clipped and unreachable (.flash-content is overflow:hidden)`);
  } else {
    ok(`${v.tag}: stage fits (bottom=${m.stageBottom} <= vh=${m.vh}, h=${m.stageH})`);
  }

  // 2. the card must be small enough for the stage to contain it VERTICALLY. Horizontal
  //    spill is the design — `.fan-stage { overflow: hidden }` is exactly what makes the
  //    coverflow a window onto a wider ring — but a card taller than its stage is clipped
  //    top and bottom, which is never intended.
  if (m.cardH != null && m.cardH > m.stageH + 1) {
    fails.push(`${v.tag} (${v.width}x${v.height}): card is ${m.cardH}px tall inside a ${m.stageH}px stage — clipped at both ends`);
  } else if (m.cardH != null) {
    ok(`${v.tag}: card ${m.cardW}x${m.cardH} fits its ${m.stageH}px stage`);
  }

  await ctx.close();
}
await b.close();

if (fails.length) {
  console.error("\n" + fails.map((f) => "FAIL: " + f).join("\n"));
  process.exit(1);
}
console.log("\nALL FLASHCARDS LANDSCAPE ASSERTIONS PASSED");
