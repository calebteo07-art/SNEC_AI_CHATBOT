/* Leaderboard — phone-refit assertions across the shared device matrix.
   Task 10 of the mobile refit. Scope: the board's OWN geometry (`.lb-climb` and its
   descendants). The nav rail is aurora.css / Task 4 territory and is NOT asserted here.

   Why geometry and not pixels: `.lb-climb::before` runs an infinite `lb-embers` drift, so
   its phase differs run to run. Measured same-build screenshot noise on this route ranged
   0.004%-60%. Rects and computed styles are the only honest instrument here.

   Why not `document.scrollWidth > clientWidth`: `.aurora-main-scroll` sets
   `overflow-x: hidden`, so it reads false while content is clipped. We measure element
   rects against the viewport instead.

   Run:  node frontend/tests/leaderboard_mobile_assert.mjs [base]
*/
import { chromium } from "playwright";
import { student, seededContext, J } from "./_mocks.mjs";
import { VIEWPORTS, DESKTOP } from "./_viewports.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
let failed = 0;
const ok = (m) => console.log("PASS:", m);
const bad = (m) => { console.error("FAIL:", m); failed++; };

/* Same cohort the aurora harness uses: `xp` is the WEEKLY score, `xp_total` lifetime.
   "Wei Jie T." is deliberately the longest nameplate — the podium plaque ellipsizes by
   design (`text-overflow: ellipsis`), so we assert the plaque BOX fits, not the glyphs. */
const LB_ROWS = [
  { name: "Aisha R.",   role: "OT", xp: 12480, xp_total: 12480, level: 24, streak_days: 31, avatar_config: { background: "galaxy" }, is_you: false },
  { name: "Wei Jie T.", role: "OA", xp: 10240, xp_total: 10240, level: 22, streak_days: 18, avatar_config: { background: "mist" }, is_you: false },
  { name: "Priya N.",   role: "OT", xp: 7720,  xp_total: 7720,  level: 18, streak_days: 12, avatar_config: null, is_you: false },
  { name: "You",        role: "OA", xp: 7660,  xp_total: 7660,  level: 17, streak_days: 9,  avatar_config: { background: "peach" }, is_you: true },
  { name: "Marcus L.",  role: "OT", xp: 7635,  xp_total: 7635,  level: 17, streak_days: 6,  avatar_config: null, is_you: false },
  { name: "Siti N.",    role: "OA", xp: 6120,  xp_total: 6120,  level: 15, streak_days: 22, avatar_config: null, is_you: false },
].map((e, i) => ({ ...e, rank: i + 1 }));

async function boardCtx(b, vp) {
  const ctx = await seededContext(b, base, student, { width: vp.width, height: vp.height },
    vp.touch ? { hasTouch: true, isMobile: true } : {});
  // Registered after seededContext so it wins over the catch-all 404 (last route wins).
  await ctx.route("**/api/leaderboard**", (r) =>
    r.fulfill(J({ entries: LB_ROWS, you_hidden: false, display_name: null, roles: ["OA", "OT"] })));
  return ctx;
}

/* The board is measured SETTLED: entrance animations finished, embers frozen. Freezing the
   infinite drift keeps the read deterministic without changing layout (it only animates
   background-position on a z-index:-1 pseudo-element). */
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
  return p;
}

/** Every rect that matters on this route, plus the viewport, in one round-trip. */
const measure = (p) => p.evaluate(() => {
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const one = (sel) => { const el = document.querySelector(sel); return el ? R(el) : null; };
  const all = (sel) => [...document.querySelectorAll(sel)].map(R);
  const title = document.querySelector(".lb-title");
  const head = document.querySelector(".lb-head");

  // Overflow: every element inside the board whose rect escapes the viewport's x-range.
  const vw = document.documentElement.clientWidth;
  const over = [];
  for (const el of document.querySelectorAll(".lb-climb, .lb-climb *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) {
      over.push({ cls: (el.className || "").toString().slice(0, 44), left: +r.left.toFixed(1), right: +r.right.toFixed(1) });
    }
  }

  // Tap targets inside the board.
  const targets = [...document.querySelectorAll(".lb-climb button, .lb-climb a, .lb-climb input")]
    .map((el) => { const r = el.getBoundingClientRect(); return { cls: (el.className || "").toString().slice(0, 30), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; });

  return {
    vw, vh: window.innerHeight,
    climb: one(".lb-climb"),
    head: one(".lb-head"),
    headPad: head ? getComputedStyle(head).padding : null,
    title: one(".lb-title"),
    titleFont: title ? getComputedStyle(title).fontSize : null,
    titleFamily: title ? getComputedStyle(title).fontFamily.split(",")[0] : null,
    // nowrap + the card clips: scrollWidth beating clientWidth IS the title clipping.
    headScrollW: head ? head.scrollWidth : 0,
    headClientW: head ? head.clientWidth : 0,
    podium: one(".lb-podium"),
    peds: all(".lb-ped"),
    pedNames: all(".lb-ped-nm"),
    pedXps: all(".lb-ped-xp"),
    crown: one(".lb-crown"),
    rows: all(".lb-row"),
    over, targets,

    /* ── the design-lock proof ──
       The podium is a locked surface, and this refit is allowed to change SIZE only. The
       plinth art is a baked webp: the drawn plinth ring, mid panel and nameplate plaque live
       at fixed spots in the image, and the live overlay is registered to them by percentage
       (.lb-ped-face top:33% / .lb-ped-xp top:60% / .lb-ped-nm top:82%). So identity is intact
       iff each plinth keeps aspect-ratio 4/5 AND every overlay stays at the same FRACTION of
       its plinth box. Those ratios are scale-invariant — identical at 360px and at 1440px —
       which is exactly what "size only" means, and what re-sizing the parts would break. */
    identity: [...document.querySelectorAll(".lb-ped")].map((ped) => {
      const pr = ped.getBoundingClientRect();
      const frac = (sel) => {
        const k = ped.querySelector(sel); if (!k) return null;
        const kr = k.getBoundingClientRect();
        return { cx: +(((kr.x + kr.width / 2) - pr.x) / pr.width).toFixed(4),
                 cy: +(((kr.y + kr.height / 2) - pr.y) / pr.height).toFixed(4),
                 w: +(kr.width / pr.width).toFixed(4) };
      };
      const cs = getComputedStyle(ped);
      return {
        place: ped.className.match(/\bp[123]\b/)?.[0] ?? "?",
        ar: +(pr.width / pr.height).toFixed(4),
        bg: (cs.backgroundImage.match(/ped-(gold|silver|bronze)/) ?? [])[1] ?? "none",
        transform: cs.transform,
        face: frac(".lb-ped-face"), xp: frac(".lb-ped-xp"), nm: frac(".lb-ped-nm"),
      };
    }),
  };
});

/** Visual order must stay 2nd · 1st · 3rd, left→right — the champion sits centre. */
const domOrder = (p) => p.evaluate(() =>
  [...document.querySelectorAll(".lb-ped")]
    .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
    .map((e) => e.className.match(/\bp[123]\b/)?.[0] ?? "?").join(" "));

const b = await chromium.launch();
const identityByTag = {};

for (const vp of [...VIEWPORTS, DESKTOP]) {
  const ctx = await boardCtx(b, vp);
  const p = await openBoard(ctx);
  const m = await measure(p);
  const at = `${vp.tag} ${vp.width}x${vp.height}`;
  identityByTag[vp.tag] = m.identity;

  // 0) Locked identity, per viewport: the plinth is 4:5 (the ratio the metal art is baked
  //    to), the champion keeps its authored raise, and the metals stay in the 2·1·3 order.
  const arBad = m.identity.filter((d) => Math.abs(d.ar - 0.8) > 0.01);
  if (arBad.length) bad(`${at}: ${arBad.length} plinth(s) off the locked 4:5 ratio: ` + arBad.map((d) => `${d.place}=${d.ar}`).join(" "));
  else ok(`${at}: all 3 plinths hold the locked 4:5 aspect ratio`);

  const p1 = m.identity.find((d) => d.place === "p1");
  // matrix(1,0,0,1,0,-12) — the authored gold-pedestal raise (leaderboard.css:118). Static,
  // intentional, and deliberately NOT a fill-mode artifact; see fixed_overlay_assert.mjs.
  if (!p1 || !/matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*-12\)/.test(p1.transform)) bad(`${at}: p1 lost its authored translateY(-12px) raise (transform=${p1?.transform})`);
  else ok(`${at}: p1 keeps its authored translateY(-12px) raise`);

  const order = await domOrder(p);
  if (order !== "p2 p1 p3") bad(`${at}: podium order is "${order}", expected "p2 p1 p3"`);
  else ok(`${at}: podium renders 2nd · 1st · 3rd, champion centre`);

  const metals = m.identity.map((d) => `${d.place}:${d.bg}`).join(" ");
  if (metals !== "p2:silver p1:gold p3:bronze" && metals !== "p1:gold p2:silver p3:bronze") {
    const want = { p1: "gold", p2: "silver", p3: "bronze" };
    const wrong = m.identity.filter((d) => d.bg !== want[d.place]);
    if (wrong.length) bad(`${at}: plinth art mismatched (${metals})`);
    else ok(`${at}: gold/silver/bronze art on p1/p2/p3`);
  } else ok(`${at}: gold/silver/bronze art on p1/p2/p3`);

  // 1) Nothing in the board escapes the viewport horizontally.
  if (m.over.length) bad(`${at}: ${m.over.length} element(s) escape the viewport: ` +
    m.over.slice(0, 4).map((o) => `.${o.cls} [${o.left}→${o.right}] vw=${m.vw}`).join(" · "));
  else ok(`${at}: no board element escapes the viewport (vw=${m.vw})`);

  // 2) All 3 plinths render and are fully visible horizontally.
  if (m.peds.length !== 3) bad(`${at}: expected 3 plinths, got ${m.peds.length}`);
  else {
    const clipped = m.peds.filter((r) => r.x < -0.5 || r.right > m.vw + 0.5);
    if (clipped.length) bad(`${at}: ${clipped.length}/3 plinths clipped: ` + clipped.map((r) => `[${r.x.toFixed(1)}→${r.right.toFixed(1)}]`).join(" "));
    else ok(`${at}: all 3 plinths fully visible (widths ${m.peds.map((r) => r.w.toFixed(0)).join("/")})`);
  }

  // 3) The hero title does not clip. `.lb-title` is nowrap inside an overflow:hidden card,
  //    so any horizontal overflow silently eats the wordmark rather than showing a scrollbar.
  if (m.headScrollW > m.headClientW + 0.5) bad(`${at}: hero title clips (.lb-head scrollW=${m.headScrollW} > clientW=${m.headClientW}, font=${m.titleFont})`);
  else ok(`${at}: hero title fits (font=${m.titleFont}, ${m.title.w.toFixed(0)}px in ${m.headClientW}px)`);

  // 4) The nameplate + score chip stay inside their plinth. These are absolutely positioned
  //    with nowrap content, so they are the first things to punch out of a narrow card.
  for (const [label, kids] of [["nameplate", m.pedNames], ["score chip", m.pedXps]]) {
    const esc = kids.filter((k, i) => {
      const ped = m.peds[i]; return ped && (k.x < ped.x - 0.5 || k.right > ped.right + 0.5);
    });
    if (esc.length) bad(`${at}: ${esc.length} ${label}(s) overflow their plinth`);
    else ok(`${at}: every ${label} sits inside its plinth`);
  }

  // 5) Tap targets in the board (role-filter chips) meet 44px on touch viewports.
  if (vp.touch) {
    const small = m.targets.filter((t) => t.h < 44 || t.w < 44);
    if (small.length) bad(`${at}: ${small.length} sub-44px target(s): ` + small.map((t) => `.${t.cls} ${t.w}x${t.h}`).join(" · "));
    else ok(`${at}: all ${m.targets.length} board targets ≥44px`);
  }

  await ctx.close();
}

await b.close();

/* ── "size only", proved across viewports ──────────────────────────────────────────────────
   Desktop is the reference. If every plinth overlay sits at the same fraction of its plinth
   on a 360px phone as on a 1440px desktop, then the refit scaled the podium and did not
   redraw it — the overlay is still registered to the baked art everywhere. A bespoke phone
   podium (moving the plaque, shrinking the face, re-cropping the card) could not pass this. */
const ref = identityByTag[DESKTOP.tag];
for (const [tag, got] of Object.entries(identityByTag)) {
  if (tag === DESKTOP.tag) continue;
  const drift = [];
  got.forEach((d, i) => {
    const r = ref[i];
    // What each overlay actually registers to the art with — check that, not more.
    // face: width:35%/39% + centred      -> position AND width scale
    // nm:   left/right:7% (=86%) + top   -> position AND width scale
    // xp:   left:50%/top:60%, but the pill is sized by its px font + padding, so its WIDTH
    //       fraction is meant to grow on a narrower plinth. Only its centre is registered.
    const keys = { face: ["cx", "cy", "w"], nm: ["cx", "cy", "w"], xp: ["cx", "cy"] };
    for (const [part, ks] of Object.entries(keys)) {
      if (!d[part] || !r[part]) continue;
      for (const k of ks) {
        // 1.5% of the plinth box: absorbs sub-pixel rounding, nothing that reads as a move.
        if (Math.abs(d[part][k] - r[part][k]) > 0.015) {
          drift.push(`${d.place}.${part}.${k} ${r[part][k]}→${d[part][k]}`);
        }
      }
    }
  });
  if (drift.length) bad(`${tag}: podium overlay drifted from the desktop registration: ${drift.slice(0, 6).join(" · ")}`);
  else ok(`${tag}: podium overlay holds the desktop registration (size-only refit)`);
}

if (failed) { console.error(`\n${failed} LEADERBOARD MOBILE ASSERTION(S) FAILED`); process.exit(1); }
console.log("\nALL LEADERBOARD MOBILE ASSERTIONS PASSED");
