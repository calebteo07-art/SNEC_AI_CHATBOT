/* Screenshots + geometry of the Home deck, on the same mocked payload home_hud_assert uses.
   Not a gate — this is the "does it READ as a game" half the numbers alone cannot answer.

   ⚠ THE REPORT CHANGED WITH THE 7TH PASS, BECAUSE WHAT CAN BREAK CHANGED. Passes 5-6 had an
   alpha-cut mascot in her own flex track, so the risk was text crossing her pale skin and the
   report was the copy↔mascot intersection (structurally 0, and it stayed 0). The card is now
   a full-bleed clip: two tracks cannot protect anything, and the two failures that replace it
   are both invisible to geometry alone —
     1. THE CROP EATS THE CREW. `cover` discards 19% of the width at desktop and 61% of the
        height at 900px. CREW_BOX (measured off the installed poster) is mapped through the
        same transform the browser uses, so "an Eyecon is cut off" is a number again.
     2. THE INK LANDS ON GRASS. The clip is a photograph, so the luminance under the copy is a
        RANGE, not a fill. This composites the real video frame with the real scrim — the
        gradient is PARSED from getComputedStyle, never re-declared here, so the CSS stays the
        only source of truth — and reports the worst contrast under each line.

   Run:  node frontend/tests/_home_shot.mjs [base] [outDir]
*/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { student, seededContext, J } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3997";
const out = process.argv[3] ?? ".tmp/home-shots";
mkdirSync(out, { recursive: true });

/* Where the four Eyecons sit in the CLIP's own frame, as fractions — measured off the
   installed poster (frontend/public/media/loops/greeting-crew.jpg), not guessed. Regenerate
   the clip and you must re-measure this. */
const CREW_BOX = { x0: 0.46, y0: 0.47, x1: 0.96, y1: 0.92 };
/* WCAG floors: the sub is 17px normal text; the h1 and its <em> are 36px/800 = LARGE text. */
const MIN_BODY = 4.5, MIN_LARGE = 3.0;

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
   the console row's threshold was picked this way. 900 is in the default set because it is
   where the crop axis FLIPS: above it `cover` trims width, at it `cover` trims height. */
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
  /* the loop needs a decoded frame before any of it can be sampled; on the phone tiers it is
     display:none and never loads, which is why this resolves-or-shrugs rather than throwing. */
  await p.waitForFunction(() => {
    const v = document.querySelector(".hm-greetvid");
    return !v || getComputedStyle(v).display === "none" || v.readyState >= 2;
  }, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1200);

  const report = await p.evaluate(({ CREW, INK }) => {
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const card = document.querySelector(".hm-greet");
    const vid = document.querySelector(".hm-greetvid");
    const h1 = document.querySelector(".hm-greet h1");
    const sub = document.querySelector(".hm-sub");

    /* ── WCAG, on the sRGB the browser actually painted ── */
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const relLum = (R, G, B) => 0.2126 * lin(R) + 0.7152 * lin(G) + 0.0722 * lin(B);
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const parseRgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

    let loop = null, contrast = null;
    if (card && vid && getComputedStyle(vid).display !== "none" && vid.videoWidth) {
      const cb = card.getBoundingClientRect();
      const cs = getComputedStyle(vid);
      const [px, py] = cs.objectPosition.split(" ").map((v) => parseFloat(v) / 100);
      /* the exact `object-fit:cover` transform: scale to the larger ratio, then object-position
         distributes the OVERFLOW (a negative free space), which is why the same formula gives
         both the width crop above 900px and the height crop at it. */
      const scale = Math.max(cb.width / vid.videoWidth, cb.height / vid.videoHeight);
      const rw = vid.videoWidth * scale, rh = vid.videoHeight * scale;
      const ox = (cb.width - rw) * (isNaN(px) ? 0.5 : px);
      const oy = (cb.height - rh) * (isNaN(py) ? 0.5 : py);
      const toCard = (fx, fy) => ({ x: ox + fx * rw, y: oy + fy * rh });
      const a = toCard(CREW.x0, CREW.y0), z = toCard(CREW.x1, CREW.y1);
      loop = {
        objectPosition: cs.objectPosition,
        natural: `${vid.videoWidth}x${vid.videoHeight}`,
        crew: { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(z.x - a.x), h: Math.round(z.y - a.y) },
        /* px of the crew pushed outside the card's own overflow:hidden, summed over all edges */
        clipped: Math.round(Math.max(0, -a.x) + Math.max(0, z.x - cb.width)
          + Math.max(0, -a.y) + Math.max(0, z.y - cb.height)),
      };

      /* ── composite the REAL frame with the REAL scrim ── */
      const cv = document.createElement("canvas");
      cv.width = Math.round(cb.width); cv.height = Math.round(cb.height);
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(vid, ox, oy, rw, rh);

      /* Parse the scrim out of getComputedStyle rather than restating it: a gradient edited in
         home.css and not here would otherwise report contrast the page does not have. */
      const grad = getComputedStyle(card, "::before").backgroundImage;
      /* ⚠ getComputedStyle puts the ANGLE FIRST — `linear-gradient(90deg, rgba(…)…)` — so a
         comma-anchored test never matches and a horizontal scrim gets sampled down the Y
         axis, which reports the ≤900 tier's sub at 1.68:1 when the page renders it at 5.6. */
      const horizontal = /^\s*linear-gradient\(\s*(90deg|to right)/.test(grad);
      const stops = [...grad.matchAll(/rgba?\(([\d.,\s]+)\)\s*([\d.]+)%/g)]
        .map((m) => ({ rgba: m[1].split(",").map(Number), at: parseFloat(m[2]) / 100 }));
      const scrimAt = (t) => {
        if (!stops.length) return null;
        if (t <= stops[0].at) return stops[0].rgba;
        for (let i = 1; i < stops.length; i++) {
          if (t <= stops[i].at) {
            const A = stops[i - 1], B = stops[i];
            const k = B.at === A.at ? 0 : (t - A.at) / (B.at - A.at);
            return A.rgba.map((v, j) => v + (B.rgba[j] - A.rgba[j]) * k);
          }
        }
        return stops[stops.length - 1].rgba;
      };

      const probe = (el, label, floor, inkCss) => {
        if (!el) return null;
        const eb = el.getBoundingClientRect();
        const x0 = Math.max(0, Math.round(eb.left - cb.left)), y0 = Math.max(0, Math.round(eb.top - cb.top));
        const w = Math.min(cv.width - x0, Math.round(eb.width)), h = Math.min(cv.height - y0, Math.round(eb.height));
        if (w <= 0 || h <= 0) return null;
        const d = g.getImageData(x0, y0, w, h).data;
        const [ir, ig, ib] = parseRgb(inkCss);
        const inkL = relLum(ir, ig, ib);
        let worst = Infinity, worstAt = null;
        for (let y = 0; y < h; y += 2) {
          const t = (y0 + y) / cv.height;
          const s = scrimAt(horizontal ? 0 : t);
          for (let x = 0; x < w; x += 2) {
            const i = (y * w + x) * 4;
            let R = d[i], G = d[i + 1], B = d[i + 2];
            if (s) {
              /* horizontal scrims interpolate on x, vertical on y — same stops, other axis */
              const sc = horizontal ? scrimAt((x0 + x) / cv.width) : s;
              const al = sc[3] ?? 1;
              R = sc[0] * al + R * (1 - al); G = sc[1] * al + G * (1 - al); B = sc[2] * al + B * (1 - al);
            }
            const c = ratio(inkL, relLum(R, G, B));
            if (c < worst) { worst = c; worstAt = { x: x0 + x, y: y0 + y }; }
          }
        }
        return { label, worst: Math.round(worst * 100) / 100, floor, at: worstAt, pass: worst >= floor };
      };
      const em = h1?.querySelector("em");
      contrast = [
        probe(h1, "h1", INK.large, getComputedStyle(h1).color),
        em ? probe(em, "h1 em", INK.large, getComputedStyle(em).color) : null,
        probe(sub, "sub", INK.body, sub ? getComputedStyle(sub).color : "rgb(0,0,0)"),
      ].filter(Boolean);
    }

    return {
      deck: r(document.querySelector(".hm-deck")), greet: r(card),
      hud: r(document.querySelector(".hm-hud")), board: r(document.querySelector(".hm-board")),
      chest: r(document.querySelector(".hm-chest")), lb: r(document.querySelector(".hm-lb")),
      greetBg: card ? getComputedStyle(card).backgroundColor : null,
      greetImg: card ? getComputedStyle(card).backgroundImage.slice(0, 60) : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      loop, contrast,
    };
  }, { CREW: CREW_BOX, INK: { body: MIN_BODY, large: MIN_LARGE } });

  console.log(`\n══ ${vp.tag} ${vp.w}x${vp.h} ══`);
  console.log("  greet", JSON.stringify(report.greet), " deck", JSON.stringify(report.deck));
  console.log("  hud", JSON.stringify(report.hud), " board", JSON.stringify(report.board));
  console.log("  chest", JSON.stringify(report.chest), " lb", JSON.stringify(report.lb));
  console.log(`  greet fill ${report.greetBg}  img ${report.greetImg}`);
  console.log("  page overflow", report.overflow);
  if (report.loop) {
    const l = report.loop;
    console.log(`  loop ${l.natural} object-position=${l.objectPosition} crew=${JSON.stringify(l.crew)}`);
    console.log(`  CREW clipped=${l.clipped}px → ${l.clipped === 0 ? "whole" : "CUT OFF"}`);
    if (l.clipped !== 0) bad++;
  } else console.log("  loop: not rendered (expected on the three phone tiers)");
  for (const c of report.contrast ?? []) {
    console.log(`  INK ${c.label.padEnd(6)} worst ${String(c.worst).padStart(6)}:1  (floor ${c.floor})` +
      `  at ${c.at.x},${c.at.y} → ${c.pass ? "pass" : "FAIL"}`);
    if (!c.pass) bad++;
  }
  if (report.overflow > 0) bad++;

  const f = `${out}/${vp.tag}.png`;
  await p.screenshot({ path: f, fullPage: vp.tag === "laptop" });
  console.log("  shot", f);
  await ctx.close();
}
await b.close();
console.log(bad === 0 ? "\nOK — crew whole, ink above its floor, no overflow"
                      : `\nFAIL: ${bad} problem(s) above`);
process.exit(bad === 0 ? 0 : 1);
