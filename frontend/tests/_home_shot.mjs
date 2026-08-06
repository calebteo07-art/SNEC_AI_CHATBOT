/* Screenshots + geometry of the Home deck, on the same mocked payload home_hud_assert uses.
   Not a gate — this is the "does it READ as a game" half the numbers alone cannot answer,
   plus the measurements the greeting card's mascot crop has to be tuned against.

   The mascot report is the point: the Veo loop is a 1280x720 clip on a card that is far
   wider than 16:9, so `object-fit:cover` scales it by WIDTH and throws away most of its
   height. It prints the source band actually on screen against the mascot's own bounds in
   the source frame, so "she is cut off" becomes a number instead of an opinion.

   Run:  node frontend/tests/_home_shot.mjs [base] [outDir]
*/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { student, seededContext, J } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3997";
const out = process.argv[3] ?? ".tmp/home-shots";
mkdirSync(out, { recursive: true });

/* Measured off frame 20 of greeting-selena.mp4 (1280x720): the mascot including her feet,
   excluding the cast shadow below her. Everything the crop report says is relative to it. */
const SRC = { w: 1280, h: 720 };
const MASCOT = { top: 215, bottom: 600, left: 720, right: 1170 };

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

/* The four the crop was tuned against. `HOME_SHOT_VP="1200x800,1100x800"` swaps in your own
   when you are hunting a breakpoint — the console row's threshold was picked this way. */
const VIEWPORTS = process.env.HOME_SHOT_VP
  ? process.env.HOME_SHOT_VP.split(",").map((s) => {
      const [w, h] = s.trim().split("x").map(Number);
      return { w, h, tag: `${w}x${h}` };
    })
  : [
    { w: 1512, h: 860, tag: "laptop" },
    { w: 1280, h: 800, tag: "small-desktop" },
    { w: 390, h: 844, tag: "phone", touch: true },
    { w: 844, h: 390, tag: "phone-landscape", touch: true },
  ];

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

  const report = await p.evaluate((k) => {
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const card = document.querySelector(".hm-greet");
    const box = document.querySelector(".hm-eyeconloop");
    const vid = document.querySelector(".hm-eyeconloop-v");
    let crop = null;
    if (box && vid) {
      const bb = box.getBoundingClientRect();
      const cs = getComputedStyle(vid);
      const fit = cs.objectFit;
      // The used object-position, resolved to a 0-1 fraction of the OVERFLOW on each axis.
      const [px, py] = cs.objectPosition.split(" ");
      const frac = (v, ax) => v.endsWith("%") ? parseFloat(v) / 100
        : parseFloat(v) / Math.max(1, ax === "x" ? bb.width : bb.height);
      const s = fit === "contain" ? Math.min(bb.width / k.w, bb.height / k.h)
                                  : Math.max(bb.width / k.w, bb.height / k.h);
      const drawn = { w: k.w * s, h: k.h * s };
      // Source pixels actually visible, per axis.
      const band = (drawnPx, boxPx, srcPx, f) => {
        if (drawnPx <= boxPx) return { from: 0, to: srcPx, whole: true };
        const overflow = drawnPx - boxPx;
        const from = (overflow * f) / s;
        return { from, to: from + boxPx / s, whole: false };
      };
      crop = {
        fit, scale: +s.toFixed(3), box: r(box),
        drawn: { w: Math.round(drawn.w), h: Math.round(drawn.h) },
        x: band(drawn.w, bb.width, k.w, frac(px, "x")),
        y: band(drawn.h, bb.height, k.h, frac(py, "y")),
      };
      crop.mascotFullyVisible = crop.y.from <= k.m.top && crop.y.to >= k.m.bottom
        && crop.x.from <= k.m.left && crop.x.to >= k.m.right;
      crop.cutTopPx = Math.max(0, Math.round((crop.y.from - k.m.top) * s));
      crop.cutBottomPx = Math.max(0, Math.round((k.m.bottom - crop.y.to) * s));
      crop.mascotDrawnH = Math.round((k.m.bottom - k.m.top) * s);
    }
    return {
      deck: r(document.querySelector(".hm-deck")), greet: r(card),
      hud: r(document.querySelector(".hm-hud")), board: r(document.querySelector(".hm-board")),
      chest: r(document.querySelector(".hm-chest")), lb: r(document.querySelector(".hm-lb")),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      crop,
    };
  }, { ...SRC, m: MASCOT });

  console.log(`\n══ ${vp.tag} ${vp.w}x${vp.h} ══`);
  console.log("  greet", JSON.stringify(report.greet), " deck", JSON.stringify(report.deck));
  console.log("  hud", JSON.stringify(report.hud), " board", JSON.stringify(report.board));
  console.log("  chest", JSON.stringify(report.chest), " lb", JSON.stringify(report.lb));
  console.log("  page overflow", report.overflow);
  if (report.crop) {
    const c = report.crop;
    console.log(`  loop fit=${c.fit} scale=${c.scale} box=${JSON.stringify(c.box)} drawn=${c.drawn.w}x${c.drawn.h}`);
    console.log(`  visible source y ${c.y.from.toFixed(0)}..${c.y.to.toFixed(0)} of ${SRC.h}` +
      `  x ${c.x.from.toFixed(0)}..${c.x.to.toFixed(0)} of ${SRC.w}`);
    console.log(`  MASCOT whole=${c.mascotFullyVisible} cutTop=${c.cutTopPx}px cutBottom=${c.cutBottomPx}px drawnHeight=${c.mascotDrawnH}px`);
  } else console.log("  loop: not rendered");

  const f = `${out}/${vp.tag}.png`;
  await p.screenshot({ path: f, fullPage: vp.tag === "laptop" });
  console.log("  shot", f);
  await ctx.close();
}
await b.close();
