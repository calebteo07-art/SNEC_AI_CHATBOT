/* Screenshots + geometry of the Home deck, on the same mocked payload home_hud_assert uses.
   Not a gate — this is the "does it READ as a game" half the numbers alone cannot answer.

   ⚠ THE MASCOT REPORT CHANGED WITH THE 5TH PASS. It used to resolve the Veo clip's
   `object-fit:cover` crop, because the loop was a 1280x720 opaque band on a card far wider
   than 16:9 and "she is cut off" needed to be a number. The clip is retired; she is an
   alpha-cut raster in her own flex track now, so `contain` on a fixed box cannot crop her.
   What CAN go wrong instead is the thing the opaque clip used to mask: cream text running
   over her pale skin at ~1.3:1. So the report is now the INTERSECTION between the copy and
   the mascot, which must be 0 at every viewport, plus whether the card clips her at all.

   Run:  node frontend/tests/_home_shot.mjs [base] [outDir]
*/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { student, seededContext, J } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3997";
const out = process.argv[3] ?? ".tmp/home-shots";
mkdirSync(out, { recursive: true });

/* The greeting card's certified fill (design-lock Home, 5th pass): #5A2462, the DARKER band
   of its hard-stop plane — the one a contrast probe reads. */
const GREET_BG = "rgb(90, 36, 98)";

const homePayload = () => ({
  quests: [
    { kind: "adaptive", title: "Clear 2 decks in Distance Visual Acuity", target: 2, reward_xp: 40, progress: 1, complete: false, claimed: false },
    { kind: "breadth", title: "Run 1 OSCE station", target: 1, reward_xp: 30, progress: 1, complete: true, claimed: false },
    { kind: "stretch", title: "Earn 100 XP today", target: 100, reward_xp: 50, progress: 55, complete: false, claimed: false },
  ],
  chest: { claimed: false, key: "xp2x", label: "2x Lumens for 20 minutes" },
  boost: { multiplier: 2, until: new Date(Date.now() + 18 * 60_000).toISOString() },
  league: { rank: 1, pool_size: 6, promote_count: 3, division_name: "Silver", xp_to_promotion: 0 },
});

/* `HOME_SHOT_VP="1200x800,1100x800"` swaps in your own when you are hunting a breakpoint —
   the console row's threshold was picked this way. 900 is added to the default set because
   it is the tier where the mascot is still drawn beside a FULL-WIDTH card, i.e. the one
   place the copy has the most room to run into her. */
const VIEWPORTS = process.env.HOME_SHOT_VP
  ? process.env.HOME_SHOT_VP.split(",").map((s) => {
      const [w, h] = s.trim().split("x").map(Number);
      return { w, h, tag: `${w}x${h}` };
    })
  : [
    { w: 1512, h: 860, tag: "laptop" },
    { w: 1280, h: 800, tag: "small-desktop" },
    { w: 900, h: 900, tag: "single-column" },
    { w: 390, h: 844, tag: "phone", touch: true },
    { w: 844, h: 390, tag: "phone-landscape", touch: true },
  ];

let bad = 0;
const b = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await seededContext(b, base, student, { width: vp.w, height: vp.h },
    vp.touch ? { hasTouch: true, isMobile: true } : {});
  await ctx.route("**/api/home", (r) => r.fulfill(J(homePayload())));
  const p = await ctx.newPage();
  await p.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-testid="home-root"]', { timeout: 25000 });
  await p.waitForSelector('[data-testid="hud-status"]', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1200);

  const report = await p.evaluate(() => {
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    /* Intersection AREA, not "do the boxes touch" — a zero-width sliver is not an overlap. */
    const overlap = (a, c) => {
      if (!a || !c) return 0;
      const A = a.getBoundingClientRect(), C = c.getBoundingClientRect();
      const w = Math.min(A.right, C.right) - Math.max(A.left, C.left);
      const h = Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top);
      return w > 0 && h > 0 ? Math.round(w * h) : 0;
    };
    const card = document.querySelector(".hm-greet");
    const wrap = document.querySelector(".hm-iriswrap");
    const h1 = document.querySelector(".hm-greet h1");
    const sub = document.querySelector(".hm-sub");
    let mascot = null;
    if (card && wrap && getComputedStyle(wrap).display !== "none") {
      const wb = wrap.getBoundingClientRect(), cb = card.getBoundingClientRect();
      mascot = {
        box: r(wrap),
        rest: document.querySelector(".hm-iris .eyecon-logo-rest")?.getAttribute("src") ?? null,
        /* how many px of her escape the card's own overflow:hidden, summed over all edges */
        clipped: Math.round(Math.max(0, cb.left - wb.left) + Math.max(0, wb.right - cb.right)
          + Math.max(0, cb.top - wb.top) + Math.max(0, wb.bottom - cb.bottom)),
        overlapH1: overlap(h1, wrap),
        overlapSub: overlap(sub, wrap),
      };
    }
    return {
      deck: r(document.querySelector(".hm-deck")), greet: r(card),
      hud: r(document.querySelector(".hm-hud")), board: r(document.querySelector(".hm-board")),
      chest: r(document.querySelector(".hm-chest")), lb: r(document.querySelector(".hm-lb")),
      greetBg: card ? getComputedStyle(card).backgroundColor : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mascot,
    };
  });

  console.log(`\n══ ${vp.tag} ${vp.w}x${vp.h} ══`);
  console.log("  greet", JSON.stringify(report.greet), " deck", JSON.stringify(report.deck));
  console.log("  hud", JSON.stringify(report.hud), " board", JSON.stringify(report.board));
  console.log("  chest", JSON.stringify(report.chest), " lb", JSON.stringify(report.lb));
  console.log(`  greet background-color ${report.greetBg}` +
    (report.greetBg === GREET_BG ? "" : `  ← EXPECTED ${GREET_BG}`));
  console.log("  page overflow", report.overflow);
  if (report.mascot) {
    const m = report.mascot;
    const clean = m.overlapH1 === 0 && m.overlapSub === 0 && m.clipped === 0;
    console.log(`  mascot box=${JSON.stringify(m.box)} rest=${m.rest}`);
    console.log(`  MASCOT clipped=${m.clipped}px overlapH1=${m.overlapH1}px² overlapSub=${m.overlapSub}px² → ${clean ? "clean" : "BAD"}`);
    if (!clean) bad++;
  } else console.log("  mascot: not rendered (expected on both phone tiers)");
  if (report.greetBg !== GREET_BG) bad++;
  if (report.overflow > 0) bad++;

  const f = `${out}/${vp.tag}.png`;
  await p.screenshot({ path: f, fullPage: vp.tag === "laptop" });
  console.log("  shot", f);
  await ctx.close();
}
await b.close();
console.log(bad === 0 ? "\nOK — no overlap, no clipping, no overflow, fill certified"
                      : `\nFAIL: ${bad} problem(s) above`);
process.exit(bad === 0 ? 0 : 1);
