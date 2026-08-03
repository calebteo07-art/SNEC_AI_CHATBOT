/* The League — behavioural gate for the ladder board (spec 2026-08-01 §6).

   Re-pinned 2026-08-04 for the FIFTH pass, which restores the podium the fourth deleted and
   rebuilds every object in "bright arcade" material.

   The history matters, because it is why this file is shaped the way it is. The PRE-pass-4
   harness measured the podium to the pixel — DOM order 1-2-3 painting 2-1-3, a 1.7x champion
   portrait, a 2x plinth, flush plinth seams — and every one of those checks passed on a board
   the user rejected as "very obvious ai slop". They were precise measurements of the wrong
   thing, taken on a page where the ladder was below the fold. Pass 4 deleted the podium and
   replaced them with the property they had failed to protect. The podium is now back by
   explicit request, and the discipline is: the STAGE may return, the BLINDNESS may not. No
   ratio is re-pinned. What is pinned is what the reader actually gets:

     THE RANKS ARE ON SCREEN. On the pass-3 build the first ranked row began at y≈700 on a
     390x844 phone and y≈790 on a 1280x900 desktop — one visible row, half-cut. The metric is
     therefore RANKS VISIBLE (podium places + list rows), not rows: a podium place is a rank you
     can read, and counting it as chrome would be as dishonest as the old check that counted it
     as nothing. It also says nothing about HOW the top of the page is built, so it survives
     the next rebuild instead of pinning this one in place.

   What only a real browser can prove, and why each check exists:
   · at least 8 ranks are legible without scrolling, on every viewport in the matrix.
   · the podium holds exactly the top three, in DOM order 1-2-3 (so a screen reader announces
     the champion first) but PAINTED 2-1-3, with the champion's block the tallest.
   · the list resumes at rank 4 — no rank is duplicated between the stage and the ladder, and
     none is lost between them.
   · the board is ONE surface. Twenty-seven rows with their own radius, border and drop shadow
     is a settings screen; rows that share edges under one clip is a board. Measured as seams.
   · ARCADE MATERIAL, measured rather than assumed. The rejected boards were flat and soft —
     1px hairlines, 5%-alpha blurred shadows. A game object carries a dark defining outline and
     a HARD offset lip (a box-shadow with zero blur), so this samples computed border-width and
     box-shadow on the podium block and the board instead of trusting that the tokens were
     typed in. This is the check that would have failed all four rejected passes.
   · the promoted set is exactly ranks 1..promote_count, taken as the UNION of the podium and
     the list — the top three moved onto a different element from the zone header, so checking
     either one alone would silently drop three students.
   · the tier band is made of the division's METAL, and the ink on it is readable. Five
     distinct metals sampled as PAINT, not as data attributes — the old check read
     `data-metal` off the DOM, which would have passed on five identical grey pips.
   · ZERO baked raster on the board. The four deleted webps are why the old podium drifted;
     this fails the moment someone reintroduces one.
   · the rules still exist and still state the rules — they moved behind the (?), and a
     disclosure nobody can reach is the same as no explanation at all.
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

/* WCAG relative luminance + contrast, so the "is it actually light, and is the text actually
   readable on it" checks below are computed rather than eyeballed. Gold is the trap that makes
   that a testable rule rather than a taste one — #F5C542 on white is 2.2:1, so gold may be a
   FILL but never text. */
const rgb = (s) => (s ?? "").match(/[\d.]+/g)?.map(Number) ?? null;
const lum = (c) => {
  const [r, g, b] = c.slice(0, 3).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

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
  // i===4 (rank 5) is null ON PURPOSE: the "no snapshot" arrow has to be observable, and an
  // earlier fixture put the only null on a rank the podium hid — so the check below passed
  // while testing nothing. Every rank is a row now, but the redundancy is free.
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

async function openBoard(ctx, { podium = true } = {}) {
  const p = await ctx.newPage();
  await p.goto(base + "/leaderboard", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".lg-row", { timeout: 20000 });
  // Wait for the stage too, or every podium measurement below races the first paint and
  // reports a plausible zero.
  if (podium) await p.waitForSelector('[data-testid="podium-slot"]', { timeout: 20000 });
  await p.waitForFunction(() => {
    const finite = document.getAnimations().filter((a) => {
      const t = a.effect?.getComputedTiming?.();
      return typeof a.animationName === "string" && (!t || t.iterations !== Infinity);
    });
    return finite.every((a) => a.playState === "finished" || a.playState === "idle");
  }, null, { timeout: 15000 });
  // The board auto-scrolls to your row ~700ms in. Settle it, then return to the top so
  // geometry is measured against a known scroll position.
  await p.waitForTimeout(1100);
  await p.evaluate(() => document.querySelector(".aurora-main-scroll")?.scrollTo(0, 0));
  await p.waitForTimeout(120);
  return p;
}

const measure = (p) => p.evaluate(() => {
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, top: r.top }; };
  const one = (s) => { const el = document.querySelector(s); return el ? R(el) : null; };
  const all = (s) => [...document.querySelectorAll(s)].map(R);
  const txt = (s) => document.querySelector(s)?.textContent?.trim() ?? null;
  const vw = document.documentElement.clientWidth;

  const over = [];
  for (const el of document.querySelectorAll(".lb-climb, .lb-climb *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) over.push({ cls: (el.className || "").toString().slice(0, 40), left: +r.left.toFixed(1), right: +r.right.toFixed(1) });
  }

  const targets = [...document.querySelectorAll(".lb-climb button, .lb-climb a, .lb-climb input")]
    .map((el) => { const r = el.getBoundingClientRect(); return { cls: (el.className || "").toString().slice(0, 26), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; });

  // Zero-raster proof: no element ON THE BOARD may paint a bitmap. Student portraits are
  // <img>, which is legitimate — this only forbids CSS background images, which is what the
  // four deleted webps were and the only way the old overlay-vs-art drift could return.
  const rasters = [];
  const main = document.querySelector(".aurora-main");
  for (const el of [main, ...document.querySelectorAll(".lb-climb, .lb-climb *")]) {
    if (!el) continue;
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg.includes("url(")) rasters.push({ cls: (el.className || "").toString().slice(0, 40), bg: bg.slice(0, 70) });
  }

  /* The page's base colour. Written as a solid final layer under the gradients, so the
     shorthand resolves it into background-COLOR and it can be read here — the dark board
     ended its stack with a gradient, which computes to transparent and is unreadable. */
  const pageBg = getComputedStyle(document.querySelector(".aurora-main")).backgroundColor;

  /* Each text sample carries the backdrop it ACTUALLY sits on, found by walking up to the
     nearest effectively-opaque ancestor. Measuring everything against the page base instead
     would be wrong in both directions — it fails --ink-3 on a white card (4.25:1 against the
     canvas, 4.8:1 where it really renders) while saying nothing about the tier name on a
     metal band or the zone label on gold. */
  const backdropOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const m = c.match(/[\d.]+/g)?.map(Number);
      if (m && (m[3] === undefined || m[3] > 0.92)) return c;
    }
    return null;
  };
  const inkProbe = [".tb-name", ".tb-league", ".chase-n", ".chase-l", ".tb-clock",
    ".lg-zone", ".lg-nm", ".lg-sub", ".lg-score", ".lg-rk",
    // The stage carries text on saturated metal, which is exactly where "gold is a fill,
    // never a glyph" gets broken — so the podium's own type is probed too.
    ".pod-nm", ".pod-score", ".pod-num"]
    .map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, color: null, on: null };
      const cs = getComputedStyle(el);
      // A clipped gradient reports a transparent fill; report it so the check can name it.
      const fill = cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color
        ? cs.webkitTextFillColor : cs.color;
      return { sel, color: fill, on: backdropOf(el) };
    });

  /* The visible window for board content. The shell scrolls an inner element, so
     window.innerHeight would over-count by the bottom nav on a phone. */
  const scroller = document.querySelector(".aurora-main-scroll");
  const view = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const rows = all(".lg-row");

  const rowStyle = (() => {
    const el = document.querySelector(".lg-row");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, h: +el.getBoundingClientRect().height.toFixed(1) };
  })();

  /* Does this box carry a HARD LIP — an offset shadow with ZERO blur? That single property is
     what separates a mobile-game object from a dashboard card, and it is the one thing all
     four rejected passes lacked: they used blurred 4-6% shadows throughout, which is why the
     report was "flat". A computed box-shadow reads
       "rgb(r, g, b) 0px 4px 0px 0px, rgba(...) 0px 10px 16px -8px"
     so split on commas that are NOT inside an rgb()/rgba(), and ignore inset layers — an
     inset top highlight is the bevel, not the lip, and counting it would make this vacuous. */
  const hardLip = (shadow) => (shadow || "").split(/,(?![^(]*\))/).some((part) => {
    if (/inset/.test(part)) return false;
    const n = (part.match(/-?[\d.]+px/g) || []).map(parseFloat);
    return n.length >= 3 && Math.abs(n[1]) >= 2 && n[2] === 0;
  });
  const material = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      border: +parseFloat(cs.borderTopWidth || "0").toFixed(1),
      lip: hardLip(cs.boxShadow),
      shadow: (cs.boxShadow || "").slice(0, 90),
    };
  };

  return {
    vw, vh: window.innerHeight, over, targets, rasters, pageBg, inkProbe, rowStyle,
    root: one(".lb-climb"),

    /* THE check, and the one the pre-pass-4 harness had no opinion about at all: how many
       RANKS a student can read without scrolling.
       Podium places COUNT. They are ranks, and they are the ranks a reader most wants — the
       pass-4 metric ("ranked rows visible") would score a perfect podium as zero and drive the
       stage straight back off the page. Chrome is therefore everything above the first rank of
       ANY kind, which is the stage when there is one and the first row otherwise. */
    ranksInView: (() => {
      const fits = (r) => r.top >= view.top - 0.5 && r.bottom <= view.bottom + 0.5;
      return [...document.querySelectorAll('[data-testid="podium-slot"]')].map(R).filter(fits).length
        + rows.filter(fits).length;
    })(),
    rowsInView: rows.filter((r) => r.top >= view.top - 0.5 && r.bottom <= view.bottom + 0.5).length,
    slotsInView: [...document.querySelectorAll('[data-testid="podium-slot"]')].map(R)
      .filter((r) => r.top >= view.top - 0.5 && r.bottom <= view.bottom + 0.5).length,
    chrome: (() => {
      const climb = document.querySelector(".lb-climb");
      const first = document.querySelector('[data-testid="podium"]') || document.querySelector(".lg-row");
      return climb && first ? +(first.getBoundingClientRect().y - climb.getBoundingClientRect().y).toFixed(1) : null;
    })(),
    chromeParts: ["tb", "tb-head", "tb-readout", "lb-filter", "pod", "lg-zone"].map((c) => {
      const el = document.querySelector("." + c);
      return `${c}=${el ? el.getBoundingClientRect().height.toFixed(0) : "?"}`;
    }).join(" "),

    /* ── the stage ──────────────────────────────────────────────────────────────────────
       DOM order must read 1,2,3 so a screen reader announces the champion first, while the
       PAINTED order is 2,1,3. Sampling x is the only way to tell those two apart — the old
       board's DOM was literally 2-1-3 and announced second place first for weeks. */
    podiumDom: [...document.querySelectorAll('[data-testid="podium-slot"]')].map((el) => el.dataset.place ?? null),
    podiumPaint: [...document.querySelectorAll('[data-testid="podium-slot"]')]
      .map((el) => ({ place: el.dataset.place ?? null, x: el.getBoundingClientRect().x }))
      .sort((a, b) => a.x - b.x).map((s) => s.place),
    podiumRanks: [...document.querySelectorAll(".pod-num")].map((e) => e.textContent.trim()),
    podiumH: (() => {
      const el = document.querySelector('[data-testid="podium"]');
      return el ? +el.getBoundingClientRect().height.toFixed(1) : null;
    })(),
    /* Per-block material AND height. Height because the champion's block must be the tallest —
       a podium where the blocks are level is a bar chart with a crown on it — and material
       because "the blocks are metal" is exactly the sort of claim that survives a screenshot
       while the CSS says #FFF. */
    podiumBlocks: [...document.querySelectorAll('[data-testid="podium-slot"]')].map((el) => {
      const block = el.querySelector(".pod-block");
      const cs = block ? getComputedStyle(block) : null;
      return {
        place: el.dataset.place ?? null,
        promo: el.dataset.promo !== undefined,
        h: block ? +block.getBoundingClientRect().height.toFixed(1) : null,
        bg: cs ? cs.backgroundColor : null,
        border: cs ? +parseFloat(cs.borderTopWidth || "0").toFixed(1) : null,
        lip: cs ? hardLip(cs.boxShadow) : null,
      };
    }),
    matBoard: material(".lg-list"),
    matBand: material(".tb"),

    /* Seams. Every child of the board, in order — rows, the zone header, the cut — must share
       edges. A positive gap anywhere means the board went back to being a stack of cards. */
    seams: (() => {
      const kids = [...document.querySelectorAll(".lg-list > li")].map((el) => el.getBoundingClientRect());
      const out = [];
      for (let i = 0; i + 1 < kids.length; i++) out.push(+(kids[i + 1].top - kids[i].bottom).toFixed(2));
      return out;
    })(),

    firstRank: document.querySelector(".lg-row .lg-rk")?.textContent?.trim() ?? null,
    rowCount: rows.length,
    /* Every rank rendered anywhere, stage and ladder together. The split is the one place a
       student can silently VANISH — an off-by-one in splitPodium drops rank 4 or shows it
       twice, and both render perfectly well. */
    allRanks: [
      ...[...document.querySelectorAll(".pod-num")].map((e) => Number(e.textContent)),
      ...[...document.querySelectorAll(".lg-row .lg-rk")].map((e) => Number(e.textContent)),
    ],
    crowns: document.querySelectorAll(".pod-crown").length,
    crownPlace: document.querySelector(".pod-crown")?.closest("[data-place]")?.dataset.place ?? null,

    // The promotion zone, as a region.
    zoneText: txt('[data-testid="promotion-zone"]'),
    /* The promoted set as the UNION of stage and ladder. The top three are promoted and are no
       longer in the list, so reading only `.lg-item[data-promo]` would report ranks 4-7 and
       call that correct — a check that silently drops the three most visible students. */
    promoRanks: [
      ...[...document.querySelectorAll('[data-testid="podium-slot"][data-promo]')].map((el) => Number(el.dataset.place)),
      ...[...document.querySelectorAll(".lg-item[data-promo] .lg-rk")].map((e) => Number(e.textContent)),
    ].sort((a, b) => a - b),
    cutNextRank: (() => {
      const cut = document.querySelector('[data-testid="promotion-line"]');
      const next = cut?.nextElementSibling?.querySelector(".lg-rk");
      return next ? Number(next.textContent) : null;
    })(),

    /* The tier band. Sampled as PAINT: the previous harness read `data-metal` off five list
       items, which would pass just as happily on five identical grey dots. */
    bandMetal: document.querySelector(".tb")?.dataset.metal ?? null,
    bandBg: (() => { const el = document.querySelector(".tb-head"); return el ? getComputedStyle(el).backgroundColor : null; })(),
    pips: [...document.querySelectorAll(".tb-pip")].map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { state: el.dataset.state, bg: cs.backgroundColor, op: +cs.opacity, w: +r.width.toFixed(1) };
    }),

    clock: txt('[data-testid="lb-reset"]'),
    arrowDirs: [...document.querySelectorAll(".lg-mv")].map((e) => e.dataset.dir),
    chase: txt(".chase-n"),
  };
});

const b = await chromium.launch();

/* ── 1) geometry + structure, across the whole device matrix ─────────────────────────── */
for (const vp of [...VIEWPORTS, DESKTOP]) {
  const ctx = await boardCtx(b, vp);
  const p = await openBoard(ctx);
  const m = await measure(p);
  const at = `${vp.tag} ${vp.width}x${vp.height}`;

  /* ── the ladder is visible ──────────────────────────────────────────────────────────
     THE budget check, and the whole reason the podium was deleted once. The metric is RANKS,
     not rows: three of them now stand on a stage, and a check that counted only rows would
     score a perfect podium as zero and push it straight back off the page. Two checks, because
     they fail differently — the header budget catches chrome that grows above the stage, the
     rank count catches a stage or a row height that eats the ladder. */
  const HEAD = 250;
  if (m.chrome === null) bad(`${at}: could not measure the distance to the first rank`);
  else if (m.chrome > HEAD) bad(`${at}: the first rank starts ${m.chrome}px down, budget ${HEAD}px — the page is spending its height on itself [${m.chromeParts}]`);
  else ok(`${at}: the first rank starts ${m.chrome}px down (budget ${HEAD}px)`);

  /* 8 on a tall viewport = the 3 on the stage plus 5 rungs of ladder under it. On a landscape
     phone (390-430px tall, and the stage still has to fit) 6 is the honest floor. For scale:
     the pass-3 board showed ONE rank at 390x844. */
  const WANT = vp.height >= 700 ? 8 : 6;
  if (m.ranksInView < WANT) {
    bad(`${at}: only ${m.ranksInView} rank(s) legible without scrolling (${m.slotsInView} on the stage + ${m.rowsInView} rows), expected ≥${WANT} — a ladder you cannot see is not a leaderboard [${m.chromeParts}]`);
  } else ok(`${at}: ${m.ranksInView} ranks legible without scrolling — ${m.slotsInView} on the stage + ${m.rowsInView} rows (≥${WANT})`);

  /* ── the stage holds the top three, and the ladder resumes at 4 ──────────────────────
     The split is the one place a student can silently VANISH: an off-by-one drops rank 4 or
     renders it twice, and both look perfectly fine. So this checks the UNION against the whole
     division rather than checking either end alone. */
  if (String(m.podiumRanks) !== String(["1", "2", "3"])) {
    bad(`${at}: the podium shows ranks ${JSON.stringify(m.podiumRanks)}, expected 1, 2, 3`);
  } else if (m.firstRank !== "4") {
    bad(`${at}: the ladder resumes at rank ${JSON.stringify(m.firstRank)}, expected "4" — the stage already holds 1-3, so anything else duplicates or drops a student`);
  } else if (String(m.allRanks) !== String(ENTRIES.map((e) => e.rank))) {
    bad(`${at}: stage + ladder render ${m.allRanks.length} ranks for a division of ${ENTRIES.length}, and not in order — got ${JSON.stringify(m.allRanks.slice(0, 8))}…`);
  } else ok(`${at}: the stage holds ranks 1-3, the ladder resumes at 4, and all ${ENTRIES.length} ranks are present exactly once`);

  /* DOM order 1-2-3, PAINTED 2-1-3. The old board's DOM was literally 2-1-3, so every screen
     reader announced second place first — for weeks, because it looked right. */
  if (String(m.podiumDom) !== String(["1", "2", "3"])) {
    bad(`${at}: podium DOM order is ${JSON.stringify(m.podiumDom)}, expected 1,2,3 — a screen reader must reach the champion first`);
  } else if (String(m.podiumPaint) !== String(["2", "1", "3"])) {
    bad(`${at}: the podium PAINTS ${JSON.stringify(m.podiumPaint)} left-to-right, expected 2,1,3 — the champion belongs in the middle`);
  } else ok(`${at}: the podium reads 1-2-3 in the DOM and paints 2-1-3 on screen`);

  /* The champion's block is the tallest. Level blocks are a bar chart wearing a crown, and
     "which one won?" must be answerable from the silhouette alone. */
  {
    const byPlace = Object.fromEntries(m.podiumBlocks.map((s) => [s.place, s]));
    const [h1, h2, h3] = [byPlace["1"]?.h, byPlace["2"]?.h, byPlace["3"]?.h];
    if (![h1, h2, h3].every((h) => typeof h === "number" && h > 0)) {
      bad(`${at}: could not measure all three plinth heights (got ${JSON.stringify([h1, h2, h3])})`);
    } else if (!(h1 > h2 && h2 >= h3)) {
      bad(`${at}: plinth heights are ${h1}/${h2}/${h3}px for 1st/2nd/3rd — the champion's block must be the tallest`);
    } else ok(`${at}: the plinths step down ${h1} > ${h2} ≥ ${h3}px`);

    // Three distinct metals, sampled as PAINT. `data-place` would pass on three grey blocks.
    const metals = new Set(m.podiumBlocks.map((s) => s.bg));
    if (metals.size !== 3) bad(`${at}: the three places paint ${metals.size} distinct colour(s) — gold, silver and bronze must be materials, not labels`);
    else ok(`${at}: the three places wear three distinct metals`);
  }

  if (m.crowns !== 1) bad(`${at}: ${m.crowns} crowns on the board, expected exactly 1`);
  else if (m.crownPlace !== "1") bad(`${at}: the crown is on place ${m.crownPlace}, expected 1st`);
  else ok(`${at}: the champion, and only the champion, wears the crown`);

  /* ── ARCADE MATERIAL, measured ───────────────────────────────────────────────────────
     The check that would have failed all four rejected passes. "Flat and soft" is not a mood,
     it is 1px hairlines and blurred low-alpha shadows; a game object carries a real outline and
     a HARD offset lip (zero blur). Sampled from computed style, so typing the tokens into a
     comment does not satisfy it. */
  {
    const block = m.podiumBlocks.find((s) => s.place === "1");
    if (!block) bad(`${at}: no first-place block to measure`);
    else if (block.border < 2) bad(`${at}: the champion's block is outlined at ${block.border}px — a game object needs ≥2px of defining edge, not a hairline`);
    else if (!block.lip) bad(`${at}: the champion's block has no hard lip (zero-blur offset shadow) — that single property is the difference between a game object and a dashboard card`);
    else ok(`${at}: the podium is built as a game object (${block.border}px outline + a hard lip)`);

    if (!m.matBoard) bad(`${at}: could not measure the board's material`);
    else if (m.matBoard.border < 2) bad(`${at}: the board is outlined at ${m.matBoard.border}px — a hairline is the dashboard tell`);
    else if (!m.matBoard.lip) bad(`${at}: the board has no hard lip — got "${m.matBoard.shadow}"`);
    else ok(`${at}: the board carries the same material (${m.matBoard.border}px outline + a hard lip)`);

    if (!m.matBand) bad(`${at}: could not measure the tier band's material`);
    else if (m.matBand.border < 2 || !m.matBand.lip) bad(`${at}: the tier band breaks the material system (border ${m.matBand.border}px, lip ${m.matBand.lip}) — one recipe, every object`);
    else ok(`${at}: the tier band carries the material too`);
  }

  /* ONE surface. Rows share edges and carry no card chrome of their own; the list owns the
     radius and the clip. Twenty-seven floating cards is what read as a settings screen. */
  const gaps = m.seams.filter((s) => s > 1.5);
  if (!m.seams.length) bad(`${at}: could not measure the board's seams`);
  else if (gaps.length) bad(`${at}: ${gaps.length} gap(s) between board rows (max ${Math.max(...gaps)}px) — the board must be one surface, not a stack of cards`);
  else ok(`${at}: all ${m.seams.length} seams are flush — the board is one surface`);

  if (!m.rowStyle) bad(`${at}: could not read a row's style`);
  else if (m.rowStyle.radius !== "0px" || m.rowStyle.shadow !== "none") {
    bad(`${at}: rows carry their own card chrome (radius ${m.rowStyle.radius}, shadow ${m.rowStyle.shadow.slice(0, 40)}) — the list owns the radius, the rows are bands across it`);
  } else if (m.rowStyle.h > 68) {
    bad(`${at}: a row is ${m.rowStyle.h}px tall — over 68px the board stops being scannable`);
  } else ok(`${at}: rows are flat ${m.rowStyle.h}px bands with no card chrome`);

  /* ── the promotion zone ─────────────────────────────────────────────────────────────
     A filled region with a labelled head and a struck cut, replacing a hairline with a
     caption. Exactly the top 7 are inside it — three on the stage, four in the list — and the
     cut lands above rank 8. */
  if (m.cutNextRank !== PROMOTE + 1) bad(`${at}: the cut sits above rank ${m.cutNextRank}, expected ${PROMOTE + 1}`);
  else ok(`${at}: the cut sits above rank ${PROMOTE + 1} (top ${PROMOTE} promote)`);
  const wantPromo = Array.from({ length: PROMOTE }, (_, i) => i + 1);
  if (String(m.promoRanks) !== String(wantPromo)) bad(`${at}: the promoted set is ${JSON.stringify(m.promoRanks)}, expected ${JSON.stringify(wantPromo)} — stage and ladder together`);
  else ok(`${at}: exactly ranks 1-${PROMOTE} are marked promoted across the stage and the ladder`);
  // The stage is inside the zone, so it must SAY so. Three students standing on a podium with
  // no promotion marking, above a gold region that starts at rank 4, reads as excluded.
  if (!m.podiumBlocks.every((s) => s.promo)) {
    bad(`${at}: podium places ${JSON.stringify(m.podiumBlocks.filter((s) => !s.promo).map((s) => s.place))} are not marked promoted, though the top ${PROMOTE} advance — the stage must carry the zone it sits in`);
  } else ok(`${at}: the stage carries the promotion marking it sits inside`);

  /* The zone's label carries the whole mechanic, which is why nothing above the board needs a
     sentence about it. Asserted on CONTENT, not on the element existing — a generic label
     ("keep climbing!") would still render. */
  if (!m.zoneText) bad(`${at}: the promotion zone has no label — nothing on the board says what the gold region means`);
  else if (!new RegExp(`top ${PROMOTE}\\b`, "i").test(m.zoneText)) bad(`${at}: the zone label does not name the promotion count (top ${PROMOTE}): "${m.zoneText}"`);
  else if (!/Gold/.test(m.zoneText)) bad(`${at}: the zone label does not name the division being climbed into: "${m.zoneText}"`);
  else ok(`${at}: the zone label names both the cut and the destination`);

  /* ── the tier band ──────────────────────────────────────────────────────────────────
     The head of the board is made of the division's metal, so climbing re-skins the page. */
  if (m.bandMetal !== "silver") bad(`${at}: the tier band reads metal "${m.bandMetal}", expected "silver" for division 2`);
  else {
    const band = rgb(m.bandBg);
    if (!band || band[3] === 0) bad(`${at}: the tier band has no resolvable colour (${JSON.stringify(m.bandBg)}) — declare a solid under the sweep or the band is unmeasurable`);
    else if (lum(band) > 0.86) bad(`${at}: the tier band's luminance is ${lum(band).toFixed(3)} — that is white, not metal; the head must carry the division's material`);
    else ok(`${at}: the tier band is cast in the division's metal (luminance ${lum(band).toFixed(3)})`);
  }

  /* Five DISTINCT metals on the trophy road, sampled as painted colour. The rule this
     overturned was "division by luminance, never hue", which painted the Silver rung gold;
     collapsing them back to one material is the regression, and it is invisible in a
     screenshot diff if only the CSS changes. */
  if (m.pips.length !== 5) bad(`${at}: the trophy road has ${m.pips.length} pips, expected 5`);
  else {
    const hues = new Set(m.pips.map((q) => q.bg));
    if (hues.size !== 5) bad(`${at}: the five divisions paint ${hues.size} distinct colour(s) — divisions are identified by material, not by luminance`);
    else ok(`${at}: five divisions paint five distinct metals`);

    // Earned / current / locked must all read, and not by hue alone.
    const now = m.pips.find((q) => q.state === "now");
    const past = m.pips.find((q) => q.state === "past");
    const next = m.pips.find((q) => q.state === "next");
    if (!now || !past || !next) bad(`${at}: the trophy road shows only ${[...new Set(m.pips.map((q) => q.state))].join("/")} — earned, current and locked must all be present`);
    else if (now.w <= past.w) bad(`${at}: the current division is not larger than an earned one (${now.w}px vs ${past.w}px)`);
    else if (next.op >= past.op - 0.15) bad(`${at}: a locked division is not visibly dimmer than an earned one (opacity ${next.op} vs ${past.op})`);
    else ok(`${at}: earned / current / locked differ by size and opacity, not by hue alone`);
  }

  /* ── the light canvas, and readable ink on every surface ────────────────────────────
     The board shipped twice as a black stage and was rejected both times. "Light" is a value
     here, not a vibe. */
  const bg = rgb(m.pageBg);
  if (!bg || bg[3] === 0) {
    bad(`${at}: the page has no resolvable base colour (got ${JSON.stringify(m.pageBg)}) — end the background stack with a solid colour so the theme is measurable`);
  } else if (lum(bg) < 0.7) {
    bad(`${at}: the board's base luminance is ${lum(bg).toFixed(3)}, expected a light canvas (>0.7)`);
  } else ok(`${at}: the board runs on the light Aurora canvas (luminance ${lum(bg).toFixed(3)})`);

  {
    const missing = m.inkProbe.filter((t) => !t.color || !t.on).map((t) => t.sel);
    const unreadable = m.inkProbe
      .filter((t) => t.color && t.on)
      .map((t) => ({ ...t, c: rgb(t.color), b: rgb(t.on) }))
      .filter((t) => t.c && t.b && (t.c[3] === 0 || contrast(t.c, t.b) < 4.5));
    if (missing.length) bad(`${at}: could not resolve colour/backdrop for ${missing.join(", ")} — the contrast check is testing nothing`);
    else if (unreadable.length) {
      bad(`${at}: ${unreadable.length} text style(s) below 4.5:1 where they render: ` +
        unreadable.map((t) => `${t.sel} ${t.color} on ${t.on} ${t.c[3] === 0 ? "(transparent fill)" : contrast(t.c, t.b).toFixed(2) + ":1"}`).join(" · "));
    } else ok(`${at}: all ${m.inkProbe.length} text styles clear 4.5:1 on the surface they render on`);
  }

  if (m.rasters.length) bad(`${at}: the board paints ${m.rasters.length} CSS raster(s) — the zero-raster rule is broken: ` + m.rasters.slice(0, 3).map((r) => `.${r.cls} ${r.bg}`).join(" · "));
  else ok(`${at}: zero CSS rasters on the board (pure gradient + inline SVG)`);

  if (m.over.length) bad(`${at}: ${m.over.length} element(s) escape the viewport: ` + m.over.slice(0, 4).map((o) => `.${o.cls} [${o.left}→${o.right}] vw=${m.vw}`).join(" · "));
  else ok(`${at}: nothing escapes the viewport (vw=${m.vw})`);

  if (!m.clock || !/Closes in/.test(m.clock)) bad(`${at}: no countdown to the week close (got ${JSON.stringify(m.clock)})`);
  else ok(`${at}: countdown renders — "${m.clock}"`);

  // All four arrow states must be representable; "none" (no snapshot) must never be
  // collapsed into "flat" (no change).
  const dirs = new Set(m.arrowDirs);
  const gone = ["up", "down", "flat", "none"].filter((d) => !dirs.has(d));
  if (gone.length) bad(`${at}: no row rendered a "${gone.join('"/"')}" movement arrow — the fixture no longer exercises every state`);
  else ok(`${at}: movement arrows render up/down/flat/none`);

  if (vp.touch) {
    const small = m.targets.filter((t) => t.h < 44 || t.w < 44);
    if (small.length) bad(`${at}: ${small.length} sub-44px target(s): ` + small.slice(0, 5).map((t) => `.${t.cls} ${t.w}x${t.h}`).join(" · "));
    else ok(`${at}: all ${m.targets.length} board targets ≥44px`);
  }

  await ctx.close();
}

/* ── 2) "no snapshot" is not "no change" ─────────────────────────────────────────────── */
{
  const ctx = await boardCtx(b, DESKTOP);
  const p = await openBoard(ctx);
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

/* ── 3) interactions: peek sheet, rules sheet, sticky you-bar ────────────────────────── */
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

  /* The you-bar, tested in BOTH directions. One direction is not enough: a bar that never
     retires passes an "it appears" check while permanently covering a row, and a bar wired to
     a bare `isIntersecting` passes it too while hiding for a row that is only visible
     underneath the bottom nav — which is exactly what the dense board produced (rank 12 lands
     at y=817 in an 844px viewport, scored 49% visible, readable 0%). */
  await p.evaluate(() => { const s = document.querySelector(".aurora-main-scroll"); s?.scrollTo(0, s.scrollHeight); });
  await p.waitForTimeout(450);
  if (await p.locator('[data-testid="youbar"]').count() !== 1) bad("the sticky you-bar is missing while your row is scrolled off-screen");
  else {
    /* It must clear the bottom bar. Checked by HIT TEST rather than by z-index, because the
       bar lost this exact fight while holding the higher z-index (40 over the rail's 30) —
       different stacking contexts — and a control the reader cannot tap is not a control. */
    const hit = await p.evaluate(() => {
      const r = document.querySelector('[data-testid="youbar"]').getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el?.closest('[data-testid="youbar"]') ? null
        : `${el?.tagName}.${(el?.className || "").toString().slice(0, 30)}`;
    });
    if (hit) bad(`the you-bar is covered — a tap at its own centre lands on ${hit}`);
    else ok("the you-bar clears the bottom bar and receives its own taps");

    // …and tapping it takes you back, after which the bar has no reason to exist.
    await p.locator('[data-testid="youbar"]').click();
    await p.waitForTimeout(1000);
    if (await p.locator('[data-testid="youbar"]').count() !== 0) bad("the you-bar stayed up after jumping back to your row — it must retire once the row is readable");
    else ok("the you-bar appears while your row is off-screen, jumps back to it, and retires");
  }

  /* The board carries NO visibility panel (removed 2026-08-02 by request). Asserted as an
     absence rather than dropped silently: the panel has now been added and removed twice, and
     a stray re-import is the cheapest way for it to come back unnoticed. If it is ever meant
     to return, delete this check in the same commit that restores it. */
  if (await p.locator('[data-testid="lb-hide-switch"], .bs').count() !== 0) {
    bad("a visibility panel is rendering on the board — it was removed on request");
  } else ok("no visibility panel on the board");

  /* The rules moved off the default view and behind the (?). Checked for the four load-bearing
     facts rather than for the element: a sheet that opens onto vague copy would pass an
     existence check while failing the reader. Checked REACHABLE, because rules nobody can
     open are the same as no rules at all. */
  if (await p.locator(".tb-help").count() !== 1) bad("no (?) control on the tier band — the league rules are unreachable");
  else {
    await p.locator(".tb-help").click();
    await p.waitForTimeout(220);
    if (await p.locator('[data-testid="rules-sheet"]').count() !== 1) bad("the (?) did not open the rules sheet");
    else {
      const txt = (await p.locator(".rules").textContent()) ?? "";
      const want = [
        [/this week/i, "that ranking is weekly, not all-time"],
        [/Monday/i, "when the week closes"],
        [/never|nobody is ever demoted/i, "that nobody is demoted"],
        [/Bronze.*Diamond/i, "the five divisions in order"],
      ];
      const gaps = want.filter(([re]) => !re.test(txt)).map(([, why]) => why);
      if (gaps.length) bad(`the league rules never explain: ${gaps.join("; ")}`);
      else ok("the (?) opens rules covering weekly scoring, the Monday close, no-demotion and all five divisions");
      await p.keyboard.press("Escape");
      await p.waitForTimeout(150);
      if (await p.locator('[data-testid="rules-sheet"]').count() !== 0) bad("the rules sheet did not close on Escape");
    }
  }
  await ctx.close();
}

/* ── 4) motion freezes under BOTH reduce signals ─────────────────────────────────────── */
{
  // (a) the OS media query
  const ctx = await boardCtx(b, DESKTOP, { extra: { reducedMotion: "reduce" } });
  const p = await openBoard(ctx);
  const namesOf = (p) => p.evaluate(() => [
    `.lg-item:${document.querySelector(".lg-item") ? getComputedStyle(document.querySelector(".lg-item")).animationName : "missing"}`,
    `.lg-row[data-you]::before:${document.querySelector(".lg-row[data-you]")
      ? getComputedStyle(document.querySelector(".lg-row[data-you]"), "::before").animationName : "missing"}`,
  ]);
  const osNames = await namesOf(p);
  if (osNames.some((n) => !n.endsWith(":none"))) bad(`prefers-reduced-motion did not freeze the board: ${osNames.join(" ")}`);
  else ok("prefers-reduced-motion freezes the rows and your row's marker");

  // (b) the in-app toggle, which the OS query cannot cover
  await p.evaluate(() => { document.documentElement.dataset.motion = "reduce"; });
  const appNames = await namesOf(p);
  if (appNames.some((n) => !n.endsWith(":none"))) bad(`html[data-motion="reduce"] did not freeze the board: ${appNames.join(" ")}`);
  else ok('html[data-motion="reduce"] freezes the board too');
  await ctx.close();
}

/* ── 5) a cohort of one still gets a board ───────────────────────────────────────────── */
{
  const solo = { ...BOARD, entries: [{ ...ENTRIES[0], name: "You", is_you: true, rank: 1, rank_delta: null }],
                 pool_size: 1, promote_count: 0 };
  const ctx = await boardCtx(b, VIEWPORTS[1], { board: solo });
  const p = await openBoard(ctx, { podium: false });
  const rows = await p.locator('[data-testid="lb-row"]').count();
  const cut = await p.locator('[data-testid="promotion-line"]').count();
  const zone = await p.locator('[data-testid="promotion-zone"]').count();
  if (rows !== 1) bad(`a cohort of one rendered ${rows} rows, expected 1`);
  else ok("a cohort of one still renders a board");
  if (cut !== 0 || zone !== 0) bad("a cohort of one drew a promotion zone — nobody can be promoted out of a pool of one");
  else ok("no promotion zone when promote_count is 0");
  /* An UNDERFILLED podium is no podium. One student on a three-place stage is a plinth with
     nobody beside it; splitPodium refuses below `places`, and that refusal has to reach the
     DOM or the solo board renders a lone block labelled "1st" over an empty ladder. */
  if (await p.locator('[data-testid="podium"]').count() !== 0) {
    bad("a cohort of one built a podium — a three-place stage holding one student is a hole, not a ceremony");
  } else ok("no podium for a cohort too small to fill it");
  await ctx.close();
}

/* ── 6) the promotion zone is NOT drawn on a role-filtered view ──────────────────────── */
{
  const ctx = await boardCtx(b, DESKTOP);
  const p = await openBoard(ctx);
  if (await p.locator('[data-testid="promotion-line"]').count() !== 1) bad("no cut on the unfiltered board");
  else {
    await p.locator('.lb-filter .lb-chip:has-text("OT")').click();
    await p.waitForTimeout(500);
    const left = await p.locator('[data-testid="promotion-line"], [data-testid="promotion-zone"]').count();
    if (left !== 0) {
      bad("the promotion zone survived a role filter — promote_count describes the whole division, so a filtered cut points at the wrong student");
    } else ok("the promotion zone is withheld on a role-filtered view");

    /* …and so is the PODIUM, for the same reason and one the zone check cannot cover. The top
       three of a filtered view are the best three OT, whose real division ranks here are 1, 3
       and 5. A stage labelled 1-2-3 would be false; a stage labelled 1-3-5 is not a podium.
       So the filtered view is one honest list, and the first row is that role's best rank. */
    const stage = await p.locator('[data-testid="podium"]').count();
    if (stage !== 0) {
      bad("the podium survived a role filter — its top three are the best of that ROLE, not ranks 1-2-3 of the division");
    } else ok("the podium is withheld on a role-filtered view");

    const firstFiltered = await p.locator(".lg-row .lg-rk").first().textContent();
    if (firstFiltered?.trim() !== "1") {
      bad(`the filtered list starts at rank ${JSON.stringify(firstFiltered?.trim())} — with no stage above it, every rank belongs in the list`);
    } else ok("with the podium withheld, the filtered list starts at that role's best rank");
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
  await p2.waitForSelector(".lg-row", { timeout: 20000 });
  await p2.waitForTimeout(700);
  if (await p2.locator('[data-testid="league-result"]').count() !== 0) bad("the ceremony re-fired on a second load — the show-once invariant is broken");
  else ok("the ceremony does not re-fire on a second load (show-once holds)");
  await ctx.close();
}

await b.close();
if (failed) { console.error(`\n${failed} LEAGUE ASSERTION(S) FAILED`); process.exit(1); }
console.log("\nALL LEAGUE ASSERTIONS PASSED");
