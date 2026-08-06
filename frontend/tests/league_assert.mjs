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
     `data-tier` off the DOM, which would have passed on five identical grey pips.
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
/* HSL hue in degrees, so the palette's own rule can be measured rather than eyeballed. Null for
   a neutral, which has no position on the wheel — a grey rung is a different failure, and the
   distinctness and luminance checks already own it. */
const hue = (c) => {
  const [r, g, b] = c.slice(0, 3).map((v) => v / 255);
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d === 0) return null;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
/* ⚠ THE ARC REOPENED 2026-08-06 ("too over stimulating"), and this is what replaced it.
   150-300° was closed to tier hues for exactly one day. Closing it forced five max-chroma hues
   onto half the wheel — vermilion, lime, gold, magenta, emerald — and lime beside magenta
   beside vermilion is a fairground by construction, not by tuning. No repaint inside a closed
   arc could have fixed it.

   Deleting a palette rule and replacing it with NOTHING is how the next pass drifts straight
   back, so the ban is replaced by the two claims it was a crude proxy for:

     1. SPREAD — the five rungs use the whole wheel rather than a slice of it. Measured as 360
        minus the largest gap between adjacent hues, which is the only definition that survives
        the wrap at 0°. The rejected set scores 173°; the set that replaced it scores 233°.
     2. SEPARATION — no two rungs collapse into each other: ≥60° apart in hue, OR ≥0.15 apart
        in relative luminance. ⚠ THE `OR` IS LOAD-BEARING. Ember and Solar sit 25° apart and
        always have; they read as vermilion and gold because they are 0.25 apart in luminance,
        and a hue-only rule would ban the one pair the eye has never confused.

   ⚠ BOTH RULES FIRE ON THE REJECTED PALETTE, which is worth knowing because it locates the
   ugliness precisely. Beyond the 173° spread, two of its pairs collapse outright:
     · EMBER vs NOVA — vermilion #FF6320 and hot magenta #FF47AE, 52° apart at luminance 0.303
       against 0.288. A 0.015 gap. Two hot colours of the same weight and nearly the same
       value, neither able to sit behind the other; this pair is most of what "fairground"
       actually was.
     · VOLT vs SOLAR — acid lime and gold, 35° apart at 0.148 of luminance, which misses the
       floor by 0.002.
   Neither was visible to the closed-arc rule, because both pairs are outside 150-300°. The ban
   was policing the wrong property.

   ⚠ WHAT THE BAN WAS ACTUALLY PROTECTING, and what protects it now. A closed arc kept blue
   meaning "not a tier", which is what held the tier axis apart from the ROLE axis (--role-oa
   violet 254°, --role-ot teal 190°). With the arc open, Volt sits 20° from --role-ot. The two
   axes are separated by SCALE AND VALUE instead: a tier is a large, bright, saturated surface
   (lum 0.22-0.56), a role is a small, dark, muted gauge (lum 0.09-0.15). That is also why
   --you-blue had to become --you-ink in the same pass — your row was the one object that was
   blue, large AND bright, so it was the only one that could not survive the arc reopening. */
const SPREAD_MIN = 210;
const HUE_MIN = 60;
const LUM_MIN = 0.15;
/* Circular distance: two hues are never more than 180° apart. */
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
/* The arc the palette actually occupies — 360 minus its largest empty gap. */
const spread = (hs) => {
  const s = [...hs].sort((a, b) => a - b);
  let gap = s[0] + 360 - s[s.length - 1];
  for (let i = 1; i < s.length; i++) gap = Math.max(gap, s[i] - s[i - 1]);
  return 360 - gap;
};

/* A 30-person division with the top THREE promoting — the shape the backend produces since
   2026-08-04, when promote_count became min(n-1, 3) and the podium became the cut. It was 7
   here, which is now unreachable at any pool size. The viewer sits at rank 12, below the
   line, which is the case the whole redesign exists for. `rank_delta` deliberately covers
   all four states: climbed, fell, unchanged, and NO SNAPSHOT (null). */
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

/* The real ladder, so the board under test pays what the server pays. Volt is 1.1x — a
   round 2x here would make the chip and the road agree with each other and with nothing else. */
const LADDER = [1, 1.1, 1.25, 1.5, 2];
const BOARD = {
  entries: ENTRIES, you_hidden: false, display_name: null, roles: ["OA", "OT"],
  division: 2, division_name: "Volt", pool_size: 30, promote_count: 3,
  division_multiplier: LADDER[1], division_multipliers: LADDER,
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
  /* ⚠ .tb-clock and .lg-zone left this list on 2026-08-04, and NOT because they were
     awkward: the clock moved onto the deck as `.pod-clock`, and the ladder's zone header no
     longer renders on a normal board now that the podium holds the whole promoted set. Both
     are still swept — `.pod-clock` here, `.lg-zone` in the underfilled-stage scenario, which
     is the only board that draws one. The five objects this pass ADDED join at the same
     time, because a new coloured word that nothing measures is how a 2.2:1 label ships. */
  const inkProbe = [".tb-name", ".tb-league", ".chase-n", ".chase-l", ".pod-clock",
    ".tb-hook", ".pod-banner", ".lb-count", ".lg-role", ".lg-streak",
    ".lg-nm", ".lg-sub", ".lg-score", ".lg-rk",
    // The three words 2026-08-05 added, joining at the same time they ship. The first two are
    // the SMALLEST type on the page and both sit on saturated fills; the counter sits on its
    // own wash rather than on the strip, which is exactly where a 4.3:1 label hides.
    ".pod-banner-sub", ".pod-clock-sub", ".lb-chip-n",
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
    mainW: (() => { const el = document.querySelector(".aurora-main"); return el ? +el.getBoundingClientRect().width.toFixed(1) : null; })(),

    /* ── HOW MUCH OF EACH RUNG IS ACTUALLY INKED ────────────────────────────────────────
       "avoid white spaces at the sides" (2026-08-04) turned out to name TWO fields of dead
       white, and this is the larger of them: at 1440 the name ended at x≈520 and the score
       pill began at x≈1046, so 62% of an 848px rung was nothing at all. The board looked
       narrow because its rows were empty, not only because the page beside it was.
       Measured with a text RANGE, never an element rect: `.lg-meta` is a `1fr` grid track
       and `.lg-nm` is a flex child, so both STRETCH to the track and report a width with no
       relation to the ink inside them. An element-rect version of this check reads 0px of
       gap on the exact board that produced the complaint. */
    rowFill: (() => {
      const row = document.querySelector(".lg-row");
      const score = row?.querySelector(".lg-score");
      const meta = row?.querySelector(".lg-meta");
      if (!row || !score || !meta) return null;
      const metaLeft = meta.getBoundingClientRect().left;
      let ink = metaLeft;
      const walk = document.createTreeWalker(meta, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        const b = rg.getBoundingClientRect();
        if (b.width > 0) ink = Math.max(ink, b.right);
      }
      // Anything else riding between the name block and the score — stat chips, badges —
      // is ink too, and is exactly how a wide rung is meant to be filled.
      for (const el of row.children) {
        if (el === score || el === meta) continue;
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.left >= metaLeft) ink = Math.max(ink, b.right);
      }
      return {
        gap: +(score.getBoundingClientRect().left - ink).toFixed(1),
        w: +row.getBoundingClientRect().width.toFixed(1),
      };
    })(),

    /* The vertical rhythm, as the LAYOUT gaps down the column — TWO of them since 2026-08-05,
       where there were three. Four blocks spaced identically had no hierarchy ("space out more
       aesthetically"), so the band and its filter took the tight gap and the rest took a wider
       one; the filter is now the band's third ROW, which is the same grouping said
       structurally, and the column is head → stage → board. What is left to get wrong is
       whether either remaining gap is visible and which side of the stage carries more air. */
    rhythm: (() => {
      const r = (s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect() : null; };
      const band = r(".tb"), pod = r('[data-testid="podium"]'), list = r(".lg-list");
      if (!band || !pod || !list) return null;
      /* HOW FAR THE LIP HANGS BELOW THE BORDER BOX. Every struck object on this page ends in a
         zero-blur offset shadow with a spread — `.tb` carries `0 6px 0 3px var(--mat-ink)`, so
         9px of outlined lip is PAINTED under a box that getBoundingClientRect reports as ending
         at its border. That is not decoration to be ignored: it is the object's visible bottom
         edge, and the space a reader perceives between two cards is the layout gap MINUS it.
         Blur must be 0 — a soft cast shadow is depth, not an edge, and counting it would make
         every gap on the page look 9px smaller than it reads. */
      const lip = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return 0;
        return (getComputedStyle(el).boxShadow || "").split(/,(?![^(]*\))/).reduce((mx, part) => {
          if (/inset/.test(part)) return mx;
          const n = (part.match(/-?[\d.]+px/g) || []).map(parseFloat);
          if (n.length < 3 || n[2] !== 0) return mx;
          return Math.max(mx, n[1] + (n.length >= 4 ? n[3] : 0));
        }, 0);
      };
      return {
        headToStage: +(pod.top - band.bottom).toFixed(1),
        stageToBoard: +(list.top - pod.bottom).toFixed(1),
        /* THE SAME GAPS AS A READER SEES THEM. This is the measurement the "still crammed
           together" report was about and the one this file did not have: at 6/15/13 of layout
           the band's lip and the filter's top edge were overlapping by 3px, and every number
           collected about the rhythm said the column was correctly grouped. */
        optical: [
          +(pod.top - band.bottom - lip(".tb")).toFixed(1),
          +(list.top - pod.bottom - lip(".pod-deck")).toFixed(1),
        ],
        /* The landscape-phone tier puts the ladder BESIDE the stage, where "the gap under
           the stage" is not a quantity that exists — the list starts level with the band,
           so the subtraction returns a large negative and any bound on it is meaningless.
           Detected from geometry rather than from a media query, so the check follows the
           layout instead of a copy of its breakpoint.
           ⚠ Read off the VERTICAL relationship since 2026-08-04. It used to be
           `list.left < pod.right - 1`, which was true whenever the stage was wider than the
           list's left edge — and the deck is now full-width, so that test reported "stacked"
           on the two-column tier too. "The list starts below the stage" is the thing the
           name actually means. */
        stacked: list.top >= pod.bottom - 1,
      };
    })(),

    /* ── THE HEAD IS ONE CARD ────────────────────────────────────────────────────────────
       2026-08-05: "combine the top 2 cards, silver league and role filter, into 1 and make it
       seamless". "Seamless" is FOUR independent things, so all four are measured rather than
       the one that is easiest to see from a screenshot:
         · the strip is INSIDE the band, not a sibling styled to look adjacent;
         · it starts exactly where the row above it ends — no gap, no overlap;
         · it spans the band's full inner width, so the card has no notch in its side;
         · it draws no edge of its OWN.
       ⚠ The last is the one a restyle would leave behind, and it is the loudest. A hard lip is
       how every object on this page says "I end here"; a strip that sits flush but keeps its
       3px outlined lip paints that mark straight across the middle of a card, in the one place
       where nothing ends. Radius is the same failure in the other direction: rounded corners
       inside a rounded card read as a chip lying on it.
       Null on a single-role cohort, where no strip renders at all and the head is its two rows. */
    seam: (() => {
      const band = document.querySelector(".tb");
      const strip = document.querySelector(".lb-filter");
      if (!band || !strip) return null;
      const above = strip.previousElementSibling;
      const b = band.getBoundingClientRect(), s = strip.getBoundingClientRect();
      const bs = getComputedStyle(band), ss = getComputedStyle(strip);
      return {
        nested: band.contains(strip),
        toRowAbove: above ? +(s.top - above.getBoundingClientRect().bottom).toFixed(1) : null,
        insetL: +(s.left - (b.left + parseFloat(bs.borderLeftWidth || "0"))).toFixed(1),
        insetR: +((b.right - parseFloat(bs.borderRightWidth || "0")) - s.right).toFixed(1),
        radius: Math.max(...["borderTopLeftRadius", "borderTopRightRadius",
          "borderBottomLeftRadius", "borderBottomRightRadius"].map((k) => parseFloat(ss[k]) || 0)),
        /* Any OUTER zero-blur shadow with an offset or a spread is a lip. `inset` is excluded
           deliberately: the lit return this row keeps is what makes it read as recessed into
           the faceplate, which is the opposite of an edge. */
        lip: (ss.boxShadow || "").split(/,(?![^(]*\))/).some((part) => {
          if (/inset/.test(part)) return false;
          const n = (part.match(/-?[\d.]+px/g) || []).map(parseFloat);
          return n.length >= 3 && n[2] === 0 && (n[1] !== 0 || (n[3] || 0) !== 0);
        }),
      };
    })(),

    /* THE OUTLINE, on every struck object that claims a rung of the lip ladder. The file's
       own first rule is a dark defining edge in --mat-ink, "never grey — grey on a coloured
       fill reads as a CSS border". Three selectors were breaking it while the comment above
       them said otherwise, and `.lg-score` is instantiated once per row. A comment is not a
       constraint; this is. */
    outlines: [".lg-rk", ".lg-score", ".lg-you", '.lg-mv[data-dir="up"]', ".lg-face", ".tb-mult",
      ".pod-banner"]
      .map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { sel, w: null, c: null };
        const cs = getComputedStyle(el);
        return { sel, w: +parseFloat(cs.borderTopWidth || "0").toFixed(2), c: cs.borderTopColor };
      }),

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
    chromeParts: ["tb", "tb-head", "tb-readout", "lb-filter", "pod-deck", "lg-zone"].map((c) => {
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
      const fig = el.querySelector(".pod-fig");
      const cs = block ? getComputedStyle(block) : null;
      return {
        place: el.dataset.place ?? null,
        promo: el.dataset.promo !== undefined,
        h: block ? +block.getBoundingClientRect().height.toFixed(1) : null,
        /* Mass, which is what "the plinths look too small" was about (2026-08-04). A block is
           read against the FIGURE STANDING ON IT, not against the other two blocks — the three
           can step down perfectly and still all be trays. */
        w: block ? +block.getBoundingClientRect().width.toFixed(1) : null,
        figH: fig ? +fig.getBoundingClientRect().height.toFixed(1) : null,
        /* THE BADGE, which is what "enlarge the eyecon badges" was about (2026-08-05). It is
           also the one measurement that makes the stage's cost model legible: the stage's
           height is the CHAMPION's column, so 2nd and 3rd may grow up to his for free while
           every pixel of his is a pixel off the ladder. That asymmetry is a standing invitation
           to grow the two cheap ones past the expensive one, which would put the biggest
           portrait on the stage above a smaller champion. */
        faceW: (() => { const f = el.querySelector(".pod-face"); return f ? +f.getBoundingClientRect().width.toFixed(1) : null; })(),
        bg: cs ? cs.backgroundColor : null,
        border: cs ? +parseFloat(cs.borderTopWidth || "0").toFixed(1) : null,
        lip: cs ? hardLip(cs.boxShadow) : null,
      };
    }),
    /* THE FLANKS AGAINST THE STAGE THEY STAND BESIDE ("enlarge the podium card and everything
       inside the card", 2026-08-05). The deck's grid row is sized by the STAGE, so a flank
       shorter than it leaves empty deck ABOVE AND BELOW itself — and that void is invisible to
       every bound this file already had, because the flank's own box is full and its cell is
       full ACROSS. 118 of a 232px row read as two small labels either side of a ceremony while
       the "flank fills its cell" comment in the CSS said the opposite.
       `side` is what tells the two layouts apart without hard-coding a breakpoint: on a phone
       the modules are a caption row BELOW the stage (grid-areas "stage stage" / "banner clock")
       and share none of its height, so the ratio would be meaningless there. */
    flank: (() => {
      const stage = document.querySelector(".pod");
      const ban = document.querySelector(".pod-banner");
      const clk = document.querySelector(".pod-clock");
      if (!stage || !ban || !clk) return null;
      const s = stage.getBoundingClientRect();
      const b = ban.getBoundingClientRect(), c = clk.getBoundingClientRect();
      return {
        stageH: +s.height.toFixed(1),
        banH: +b.height.toFixed(1), clkH: +c.height.toFixed(1),
        side: b.top < s.bottom - 1 && c.top < s.bottom - 1,
      };
    })(),
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

    /* The tier band. Sampled as PAINT: the previous harness read `data-tier` off five list
       items, which would pass just as happily on five identical grey dots. */
    bandTier: document.querySelector(".tb")?.dataset.tier ?? null,
    bandBg: (() => { const el = document.querySelector(".tb-head"); return el ? getComputedStyle(el).backgroundColor : null; })(),
    /* THE CONSOLE (2026-08-06). The readout row was white for four passes and the head read as
       a letterbox of two pale strips above a cream deck and a white ladder — "too bad and
       ugly". Dark is what gives the card a base, and it is the one property here that a later
       pass can revert by accident: three of the four inks on this row are cut FOR the dark fill
       (--con-ink is 8.9:1 here and 1.9:1 on white), so a white strip does not just look like
       the old card, it silently ships three sub-AA labels. The ink probe catches the second
       half; this catches the first. */
    readoutBg: (() => { const el = document.querySelector(".tb-readout"); return el ? getComputedStyle(el).backgroundColor : null; })(),
    /* LAYER BOOKKEEPING. The canvas's own comment has warned since the ARCADE pass that
       `background-repeat` carries one value per image layer and that "miscounting here
       silently tiles a bloom across the page" — a warning is not a check, and the 08-06 pass
       re-cut the stack from eight blooms to five.
       ⚠ COMPARING THE TWO LENGTHS IS VACUOUS, which is how the first version of this was
       written. Chrome CYCLES a short background-repeat list up to the layer count before
       reporting it, so the computed lengths always agree no matter what was authored — and the
       shorthand's final colour-only layer counts as an image layer of `none`, so "six
       gradients" computes as seven. What a cycled list actually does is slide `repeat` onto the
       WRONG LAYER, so that is what this reads: the one repeating value must land on the one
       repeating gradient. Adding a bloom without adding a `no-repeat` moves the stripe and
       leaves `repeat` behind, and this fires.
       Split on top-level commas, counting parens — a lookahead cannot do it, because every
       layer contains rgba() and nested brackets of its own. */
    bgLayers: (() => {
      const el = document.querySelector(".aurora-main");
      if (!el) return null;
      const cs = getComputedStyle(el);
      const split = (s) => {
        const out = []; let depth = 0, cur = "";
        for (const ch of s || "") {
          if (ch === "(") depth++;
          else if (ch === ")") depth--;
          if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
        }
        if (cur.trim()) out.push(cur.trim());
        return out;
      };
      const img = split(cs.backgroundImage);
      const rep = split(cs.backgroundRepeat);
      return {
        n: img.length,
        tiling: img.map((v, i) => (/^repeating-/.test(v) ? i : -1)).filter((i) => i >= 0),
        repeated: rep.map((v, i) => (v === "repeat" ? i : -1)).filter((i) => i >= 0),
      };
    })(),
    pips: [...document.querySelectorAll(".tb-pip")].map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { state: el.dataset.state, bg: cs.backgroundColor, op: +cs.opacity, w: +r.width.toFixed(1) };
    }),

    clock: txt('[data-testid="lb-reset"]'),

    /* ONE EDGE (2026-08-04). "The cards and elements are not spaced out nicely" measured as
       four widths on four centres: at 1500+ an 1148px band, a ~470px filter, a 700px stage
       and an 1148px ladder, none of them agreeing where the page's edges were. No amount of
       per-block spacing fixes that, and no check on this page was looking at it.
       ⚠ THREE BLOCKS SINCE 2026-08-05, and dropping the filter from this list is not a
       weakening. It is a row inside the band now, so its edges are the band's PADDING box —
       an inset of exactly one border-width, which this bound would read as a disagreement.
       The thing it is actually inset from is checked far more tightly by `seam` above. */
    edges: (() => {
      const rs = [".tb", '[data-testid="podium"]', ".lg-list"]
        .map((sel) => document.querySelector(sel)).filter(Boolean)
        .map((el) => el.getBoundingClientRect());
      if (rs.length < 3) return null;
      return {
        n: rs.length,
        spreadL: +(Math.max(...rs.map((r) => r.left)) - Math.min(...rs.map((r) => r.left))).toFixed(1),
        spreadR: +(Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.right))).toFixed(1),
      };
    })(),
    /* The deck's own material and its banner's words. The stage holds the whole promoted set
       now, so this is where the mechanic is STATED — the ladder's zone caption no longer
       renders on a normal board. */
    deck: (() => {
      const el = document.querySelector(".pod-deck");
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        w: +parseFloat(cs.borderTopWidth || "0").toFixed(2),
        c: cs.borderTopColor,
        shadow: cs.boxShadow,
        text: (document.querySelector('[data-testid="podium-promo"]')?.textContent || "").replace(/\s+/g, " ").trim(),
      };
    })(),
    /* THE FLANKS MAY NOT TOUCH THE STAGE (2026-08-04, "top 3 promote to gold is cut off").
       The deck's two facts sit in `1fr` tracks either side of a fixed-width stage, and a
       nowrap pill sizes ITSELF: at 1440 the track was 134px against a 188px pill, so ~32px of
       "…to Gold" rendered UNDER the second plinth and ~23px poked out through the deck's own
       border. Nothing on this page could see it — the overflow sweep tests the VIEWPORT's
       edges, and a pill hidden behind an opaque plinth is inside them. Measured as real
       overlap against the stage and against the deck's padding box, on every viewport. */
    flanks: (() => {
      const deck = document.querySelector(".pod-deck");
      const pod = document.querySelector(".pod");
      if (!deck || !pod) return null;
      const d = deck.getBoundingClientRect(), s = pod.getBoundingClientRect();
      const cs = getComputedStyle(deck);
      const padL = d.left + parseFloat(cs.paddingLeft || "0") + parseFloat(cs.borderLeftWidth || "0");
      const padR = d.right - parseFloat(cs.paddingRight || "0") - parseFloat(cs.borderRightWidth || "0");
      const colGap = parseFloat(cs.columnGap || "0") || 0;
      const out = [];
      for (const sel of [".pod-banner", ".pod-clock"]) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        // Only the flanks that sit BESIDE the stage can collide with it; on the phone tier
        // they are stacked underneath it, which is a different (and legal) geometry.
        const beside = r.top < s.bottom - 1 && r.bottom > s.top + 1;
        out.push({
          sel, beside,
          onStage: beside ? +Math.max(0, Math.min(r.right, s.right) - Math.max(r.left, s.left)).toFixed(1) : 0,
          escapes: +Math.max(0, padL - r.left, r.right - padR).toFixed(1),
          /* The flank's own grid TRACK, read off the geometry either side of it rather than
             from a copy of the template: the template changes at every tier and a copy of it
             here drifts silently. Left flank = deck's padding edge → the stage; right flank =
             the stage → the deck's padding edge. */
          cell: !beside ? null : +(sel === ".pod-banner"
            ? (s.left - colGap) - padL
            : padR - (s.right + colGap)).toFixed(1),
          w: +r.width.toFixed(1),
          h: +r.height.toFixed(1),
          stageH: +s.height.toFixed(1),
        });
      }
      return out;
    })(),
    /* The lens strip's dead middle, the same budget the rung carries. It measured 843px of
       1148 empty at the top tier — the emptiest object on the page and the one nothing was
       looking at, because every check here was aimed at the rung. */
    lensFill: (() => {
      const strip = document.querySelector(".lb-filter");
      const chips = document.querySelector(".lb-chips");
      const count = document.querySelector(".lb-count");
      if (!strip || !chips || !count) return null;
      const s = strip.getBoundingClientRect();
      /* ⚠ FROM THE LAST CHIP, NOT FROM `.lb-chips`'s BOX (2026-08-05). The group is
         `flex: 1 1 auto` at desktop and its chips are capped, so the GROUP's right edge sits
         10px from the readout while the last CHIP is ~400px away — this bound reported 1%
         across a 36% void on every desktop viewport. Third object on this page to be measured
         by its box instead of its ink; `.lg-nm` and `.tb-name` are the other two, and both
         needed the same correction. */
      const last = [...chips.querySelectorAll(".lb-chip")].pop();
      const from = (last || chips).getBoundingClientRect().right;
      const gap = Math.max(0, count.getBoundingClientRect().left - from);
      /* WHAT IS ACTUALLY EMPTY is the slack the connector does not span. `.lb-chips::after` is
         the same 2px groove `.tb-chase` wears one row up — a void with a rule through it is
         tied together, which is the whole reason that rule exists. */
      const rule = getComputedStyle(chips, "::after");
      const spans = rule.content && rule.content !== "none" ? parseFloat(rule.width) || 0 : 0;
      return {
        w: +s.width.toFixed(1),
        gap: +gap.toFixed(1),
        spans: +spans.toFixed(1),
        empty: +Math.max(0, gap - spans).toFixed(1),
      };
    })(),
    /* ── THE HEAD'S DEAD MIDDLE, and its ESCAPES ────────────────────────────────────────
       The third object to be caught giving its elastic track to a left-aligned text box, and
       the one the 2026-08-04 pass fixed at ≥1400 only: below that key `.tb-name` sat in the
       `1fr` track, so on a 1366x768 laptop 365px — 40% — of a 914px head was nothing at all,
       between the name and the first plate. Same defect, same band, one breakpoint down.

       Measured with a text RANGE for the same reason `rowFill` is: `.tb-name` IS the elastic
       track in the layout this catches, so its element rect fills the void it is supposed to
       reveal and an element-rect version of this check reads ~0px of gap on the exact head
       that produced the complaint.

       ESCAPES is the other half and it is not optional. `.tb` sets `overflow: hidden`, so a
       head whose objects overflow looks perfectly fine — the pips are simply cut off at the
       band's edge — while getBoundingClientRect sees them leave. The viewport sweep cannot
       help: an object escaping the band is still inside the window. This is the bound that
       makes `minmax(0, max-content)` on the name track safe to key at 1024 rather than 1400,
       because it is what fails if a division name ever outgrows its track. */
    headFill: (() => {
      const head = document.querySelector(".tb-head");
      const name = document.querySelector(".tb-name");
      if (!head || !name) return null;
      const cs = getComputedStyle(head);
      const h = head.getBoundingClientRect();
      const L = h.left + parseFloat(cs.borderLeftWidth || "0") + parseFloat(cs.paddingLeft || "0");
      const R = h.right - parseFloat(cs.borderRightWidth || "0") - parseFloat(cs.paddingRight || "0");
      const rg = document.createRange();
      rg.selectNodeContents(name);
      const boxes = [
        head.querySelector(".tb-crest")?.getBoundingClientRect(),
        rg.getBoundingClientRect(),
        ...[...head.querySelectorAll(".tb-pip")].map((e) => e.getBoundingClientRect()),
        head.querySelector(".tb-mult")?.getBoundingClientRect(),
        head.querySelector(".tb-help")?.getBoundingClientRect(),
      ].filter((r) => r && r.width > 0).sort((a, b) => a.left - b.left);
      // The name's RANGE is the unclipped text, which on an ellipsed name runs past the band.
      // Escapes are therefore measured on the ELEMENTS, which is what actually draws.
      const els = [...head.children, ...head.querySelectorAll(".tb-pip")];
      let gap = 0, cursor = L;
      for (const r of boxes) {
        gap = Math.max(gap, Math.min(r.left, R) - cursor);
        cursor = Math.max(cursor, Math.min(r.right, R));
      }
      return {
        w: +(R - L).toFixed(1),
        gap: +Math.max(0, Math.max(gap, R - cursor)).toFixed(1),
        escapes: +Math.max(0, ...els.map((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 ? Math.max(L - r.left, r.right - R) : 0;
        })).toFixed(1),
      };
    })(),
    /* THE MODULE, as rendered AREA rather than as "the element exists". The chip it replaced
       was 44x22 in a band over 1000px wide, which is the size you give an accounting detail
       — and "make the lumens multiplier more obvious" was the report. */
    multBox: (() => {
      const el = document.querySelector('[data-testid="tier-multiplier"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    })(),
    /* THE ROAD says what each rung PAYS, not just where you stand on it. Counted as rungs
       carrying a visible x-value, so five bare dots score zero. */
    roadLabels: [...document.querySelectorAll(".tb-pip .tb-px")]
      .filter((el) => getComputedStyle(el).display !== "none" && /×/.test(el.textContent || "")).length,
    hookText: (document.querySelector('[data-testid="tier-hook"]')?.textContent || "").replace(/\s+/g, " ").trim(),
    /* COLOUR ON THE OBJECTS. 27 gauges in one graphite made the most-repeated object on the
       page the flattest thing on it. Sampled as PAINT — a data-role attribute would pass on
       27 identical grey bars. */
    gaugeHues: (() => {
      const bars = [...document.querySelectorAll(".lg-row:not([data-you]) .lg-bar")];
      return {
        bars: bars.length,
        hues: new Set(bars.map((el) => getComputedStyle(el, "::before").backgroundColor)).size,
      };
    })(),
    /* THE REST OF THE MOST-REPEATED OBJECTS (2026-08-05). The gauge was coloured and the four
       objects beside it on the same rung were not, so the ladder still resolved to grey at a
       glance. Two claims, and both are about PAINT because a token that is set but overridden
       reads exactly like a token that was never set:
       · the rank token carries the division's own tint — a chroma floor, not a specific hue,
         so re-tuning the palette does not have to re-tune the gate;
       · the avatar medallion's lip is per-ROLE, counted the same way the gauge is. */
    rungPaint: (() => {
      const chroma = (s) => {
        const m = (s ?? "").match(/[\d.]+/g)?.map(Number);
        if (!m || m.length < 3) return null;
        return Math.max(m[0], m[1], m[2]) - Math.min(m[0], m[1], m[2]);
      };
      const rk = document.querySelector(".lg-item:not([data-promo]) .lg-rk");
      const faces = [...document.querySelectorAll(".lg-item .lg-face")];
      return {
        rkChroma: rk ? chroma(getComputedStyle(rk).backgroundColor) : null,
        faces: faces.length,
        faceLips: new Set(faces.map((el) => {
          // The lip is the FIRST zero-blur offset layer in the shadow list; its colour is what
          // a reader actually sees under the ring.
          const m = getComputedStyle(el).boxShadow.match(/rgba?\([^)]*\)\s+0px\s+3px\s+0px\s+0px/);
          return m ? m[0] : "none";
        })).size,
      };
    })(),
    /* The visible multiplier only. `.tb-sr` spans carry the screen-reader sentence around it
       ("This division earns ... Lumens on everything you do"), and textContent would return
       all of it — so the chip's own visible text is read by subtracting them. */
    /* The NUMERAL only. The module gained a second visible line ("Lumens") on 2026-08-04 —
       that unit is the whole point of the change — but textContent returns "×1.1Lumens" and
       this check is about the VALUE agreeing with the payload. */
    mult: (document.querySelector('[data-testid="tier-multiplier"] .tb-mult-n')?.textContent || "").trim(),
    arrowDirs: [...document.querySelectorAll(".lg-mv")].map((e) => e.dataset.dir),
    chase: txt(".chase-n"),
  };
});

const b = await chromium.launch();

/* 1366x768 is the most common laptop, and on 2026-08-04 it became the board's tightest case:
   desktop went back to ONE COLUMN, so the stage and the ladder now stack in the same column and
   the viewport's HEIGHT is the entire ranks budget. 1440x900 no longer represents it — that
   window is 132px taller, which is two whole rungs. Local to this file rather than added to
   VIEWPORTS, because it is a leaderboard-layout risk and not a device every harness must sweep. */
const LAPTOP = { tag: "laptop", width: 1366, height: 768, touch: false };

/* A MAXIMISED large monitor, added 2026-08-04 with the ribbon bound above. Without it that
   bound tests nothing: DESKTOP is 1440x900, where an 880px column already covers 61% of the
   field, so every viewport in the matrix passed a check aimed squarely at the viewport the
   complaint came from. A gate that cannot fail on the reported case is not a gate — this is
   the same "precise measurement of the wrong thing" the pass-4 history warns about, in its
   other form: precise measurement on the wrong DEVICE. */
const WIDE = { tag: "wide", width: 1920, height: 1080, touch: false };

/* THE REPORTED WINDOW, and the third time this file has had to learn the same lesson: a bound
   that cannot fail on the device the complaint came from is not a bound. "Top 3 promote to
   Gold is cut off" was photographed at ~1489x838 — a 1080p laptop at 125-133% Windows scaling,
   which is the single most common desktop viewport there is. It is WIDE but SHORT, and every
   desktop entry above is either narrower (1366) or taller (1440x900, 1920x1080), so it fell
   into a breakpoint cell nothing swept: the ≥860px height step missed it, the old ≥1500px
   width step missed it, and it landed on the smallest board the desktop range can produce —
   860px on its own 1489px field, 57.8%, straight through the ribbon floor above. Both of the
   two defects the user reported lived in that cell. */
const SHORT_WIDE = { tag: "short-wide", width: 1489, height: 838, touch: false };

/* A 5:4 MONITOR, and the only entry that is here for a CODE PATH rather than for a device.
   The desktop range is two axes — a width step at 1400 and height steps at 620/830/900 — and
   every wide entry above is ≥1400, so the full stage had only ever been measured at its 700px
   width on an 1180-1320px board. `--stage-w: 620px` inside a 1060px board, which is what every
   1024-1399px window ≥830 tall actually renders, was reachable by nobody in the matrix: the
   flank tracks are ~185px there rather than ~197-269, and that is the tightest they get on any
   desktop tier. 1280x1024 is a real resolution that lands squarely in that cell.
   ⚠ It is NOT the ranks-budget case. Slack rises with height inside a step, so the binding
   member of a height step is its SHORTEST window — 1489x838 for ≥830 and 1440x900 for ≥900,
   both already above. This one is about width. */
const FIVE_FOUR = { tag: "five-four", width: 1280, height: 1024, touch: false };

/* ── 1) geometry + structure, across the whole device matrix ─────────────────────────── */
for (const vp of [...VIEWPORTS, LAPTOP, DESKTOP, SHORT_WIDE, FIVE_FOUR, WIDE]) {
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

    /* PLINTH MASS, both bounds. The stepping check above passed on a board the user read as
       "the plinths look too small" (2026-08-04), because three blocks can step down perfectly
       and all three still be trays. The bound that matters is the block against the FIGURE
       STANDING ON IT, and it is two-sided:
         · TOO SMALL — the champion's block under 0.78x its own figure stack (portrait + name +
           score) is a plinth-shaped shadow under a head. Every rejected version sat at 0.5-0.63.
           The floor drops to 0.6 on a landscape phone, where the left column runs into the
           floating nav and the honest trade is a shorter stage, not a clipped lip. Only the
           champion is measured: 2nd and 3rd MUST step down, so the same ratio would forbid the
           silhouette the podium exists for.
         · TOO TALL — any block taller than it is wide is a tower, not a plinth. That is the
           shape you drift into the moment you size the stage to fill leftover page instead of
           to fit its own figure, which is exactly what the same report asked for. */
    const floor = vp.height >= 700 ? 0.78 : 0.6;
    for (const s of m.podiumBlocks) {
      if (!(s.h > 0) || !(s.w > 0) || !(s.figH > 0)) {
        bad(`${at}: could not measure place ${s.place}'s block against its figure`);
      } else if (s.place === "1" && s.h < s.figH * floor) {
        bad(`${at}: the champion's block is ${s.h}px under a ${s.figH}px figure (${(s.h / s.figH).toFixed(2)}x, floor ${floor}x) — a tray under a head`);
      } else if (s.w <= s.h) {
        bad(`${at}: place ${s.place}'s block is ${s.w}x${s.h} — taller than it is wide is a tower, not a plinth`);
      } else ok(`${at}: place ${s.place}'s block is ${s.w}x${s.h} under a ${s.figH}px figure`);
    }

    // Three distinct metals, sampled as PAINT. `data-place` would pass on three grey blocks.
    const metals = new Set(m.podiumBlocks.map((s) => s.bg));
    if (metals.size !== 3) bad(`${at}: the three places paint ${metals.size} distinct colour(s) — first, second and third must be materials, not labels`);
    else ok(`${at}: the three places wear three distinct metals`);

    /* THE CHAMPION WEARS THE BIGGEST BADGE (2026-08-05). Not decoration — it guards the stage's
       cost model. The stage's height is the champion's column, so 2nd and 3rd can be grown all
       the way up to his for FREE while every pixel of his comes straight off the ladder, and
       that asymmetry is a standing invitation to spend "make the badges bigger" on the two
       cheap ones. Do that and the crowned portrait is the smallest of the three.
       Ordered, never pinned: the sizes change at four tiers and a pinned 96/84 would fail on
       the next retune while this survives it. */
    const faces = Object.fromEntries(m.podiumBlocks.map((s) => [s.place, s.faceW]));
    const [f1, f2, f3] = [faces["1"], faces["2"], faces["3"]];
    if (![f1, f2, f3].every((f) => typeof f === "number" && f > 0)) {
      bad(`${at}: could not measure all three podium badges (got ${JSON.stringify([f1, f2, f3])})`);
    } else if (!(f1 > f2 && f2 >= f3)) {
      bad(`${at}: the badges are ${f1}/${f2}/${f3}px for 1st/2nd/3rd — the champion's portrait must be the largest on the stage`);
    } else ok(`${at}: the badges step down ${f1} > ${f2} ≥ ${f3}px`);

    /* THE DECK HAS NO DEAD BANDS IN IT (2026-08-05, "enlarge the podium card and everything
       inside the card" — the third "bigger" report on this one card). Two-sided on purpose:
         · FLOOR — a flank under 0.65 of the stage leaves a strip of empty deck above AND below
           itself, which is what the first two reports were actually looking at. The flank's own
           box was full and its cell was full across, so nothing here could see it. Free to fix:
           the row is sized by the stage, so a shorter flank grows for nothing.
         · CEILING — and that is exactly why it needs one. A flank TALLER than the stage makes
           the ceremony the short object on its own deck, and "it was free" is the argument that
           gets you there. */
    if (m.flank && m.flank.side) {
      const { stageH, banH, clkH } = m.flank;
      const fill = Math.min(banH, clkH) / stageH;
      if (!(stageH > 0)) bad(`${at}: could not measure the stage the flanks stand beside`);
      else if (fill < 0.65) {
        bad(`${at}: the deck's flanks are ${banH}/${clkH}px beside a ${stageH}px stage (${(fill * 100).toFixed(0)}%, floor 65%) — the shortfall is empty deck above AND below each module, and the stage's row is free height`);
      } else if (banH > stageH + 0.5 || clkH > stageH + 0.5) {
        bad(`${at}: a flank is ${Math.max(banH, clkH)}px beside a ${stageH}px stage — the ceremony must be the tallest thing on its own deck`);
      } else ok(`${at}: the flanks fill ${(fill * 100).toFixed(0)}% of the ${stageH}px stage row (${banH}/${clkH}px, 65-100%)`);
    }
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

  /* ── THE BOARD IS NOT A RIBBON, AND THE RUNG IS NOT A SPREADSHEET ────────────────────
     "avoid white spaces at the sides" (2026-08-04) — the THIRD report of it, and the first
     time it was measured rather than argued about. It named TWO fields of dead white:

       · BESIDE the board. An 880px column on a 1920px field is a ribbon down the middle
         with 520px of untouched canvas either side.
       · INSIDE every rung, which is the larger one and the one nobody had looked at: the
         name ended at x≈520 and the score pill began at x≈1046, so 62% of an 848px row
         was nothing at all. The board read as narrow because its ROWS were empty.

     The two bounds pull against each other on purpose, which is what makes this a budget
     rather than a preference: the cheap way to satisfy the first is to stretch the board,
     and a stretched rung is exactly the spreadsheet row the lock has warned about since
     the two-column split — the same complaint, moved inside the board. Width may only be
     taken if the rung is filled, and the rung may only be filled with real content.

     The ratio bound is deliberately BANDED rather than universal. Below ~1360 there is no
     spare width to spend, and above ~2000 the honest answer is arena furniture beside the
     ladder, not a 1500px rung — a ratio gate up there would mandate the spreadsheet this
     check exists to forbid. */
  if (!m.rowFill) bad(`${at}: could not measure how much of a rung is inked`);
  else {
    const share = m.rowFill.gap / m.rowFill.w;
    if (share > 0.34) {
      bad(`${at}: ${m.rowFill.gap}px of a ${m.rowFill.w}px rung is empty between the name and the score (${(share * 100).toFixed(0)}%, budget 34%) — that dead middle is the white space, and it is inside the board`);
    } else ok(`${at}: a rung's dead middle is ${m.rowFill.gap}px of ${m.rowFill.w}px (${(share * 100).toFixed(0)}%, budget 34%)`);
  }
  /* THE FLANKS MAY NOT TOUCH THE STAGE. See the note on `flanks` in measure(): this is the
     bug the user photographed, and it was invisible to every check on the page because the
     overflow sweep looks at the VIEWPORT's edges and a pill hidden under an opaque plinth is
     inside them. 0px of overlap, no tolerance — a flank that reaches the stage at all has
     already lost characters off the end of a sentence. */
  if (m.flanks === null) bad(`${at}: could not measure the deck's flanks`);
  else {
    const hit = m.flanks.filter((f) => f.onStage > 0 || f.escapes > 0.5);
    if (hit.length) {
      for (const f of hit) {
        bad(`${at}: ${f.sel} overlaps the stage by ${f.onStage}px and escapes the deck by ${f.escapes}px — its text is being drawn under a plinth`);
      }
    } else ok(`${at}: both deck flanks clear the stage and stay inside the deck`);

    /* AND THEN IT FILLS IT (2026-08-05, "make the elements in the podium card bigger to prevent
       white space"). The bound the pass before this one did not have, and the defect it left
       behind: the flanks were made un-clippable and then left CONTENT-sized, so each one was a
       142x74 pill adrift in a ~197px track beside a 283px stage — 28% of its width and 74% of
       its height empty deck, which is precisely the white space that got reported.
       There is no budget argument for leaving them small, which is why this is a floor rather
       than a preference: the track is `1fr` (free) and the deck's row is sized by the STAGE, so
       a flank grows in both axes for nothing. The stage is the only object on the deck whose
       size is charged to the ladder.
       Guarded to the flanks that sit BESIDE the stage: on the phone tier they are a caption row
       underneath it, where "its own track" is the whole deck and the ratio means nothing. */
    for (const f of m.flanks.filter((x) => x.beside && x.cell > 0)) {
      const fill = f.w / f.cell, tall = f.h / f.stageH;
      if (fill < 0.85) {
        bad(`${at}: ${f.sel} is ${f.w}px in a ${f.cell}px track (${(fill * 100).toFixed(0)}%, floor 85%) — the deck's white space is a flank that never filled its own cell`);
      } else if (tall < 0.4) {
        bad(`${at}: ${f.sel} is ${f.h}px tall beside a ${f.stageH}px stage (${(tall * 100).toFixed(0)}%, floor 40%) — a label beside the ceremony, not one of three objects standing on the deck`);
      } else ok(`${at}: ${f.sel} fills ${(fill * 100).toFixed(0)}% of its track and ${(tall * 100).toFixed(0)}% of the stage's height`);
    }
  }

  /* THE LENS STRIP IS NOT AN EMPTY BAR — the rung's dead-middle budget, applied to the object
     that was worse than the rung and that nothing was measuring: 843px of an 1148px strip.
     ⚠ Measured from the LAST CHIP since 2026-08-05, and against what the connector does not
     span. Read off `.lb-chips`'s box it said 1% while ~36% of the row was void, which is the
     exact shape of this page's recurring defect: precise measurement of the wrong quantity. */
  if (!m.lensFill) ok(`${at}: no role lens on this board (single-role cohort)`);
  else {
    const share = m.lensFill.empty / m.lensFill.w;
    if (share > 0.34) {
      bad(`${at}: ${m.lensFill.empty}px of the ${m.lensFill.w}px lens row is empty between the last chip and the readout (${(share * 100).toFixed(0)}%, budget 34%) — ${m.lensFill.gap}px of slack with ${m.lensFill.spans}px of connector through it`);
    } else ok(`${at}: the lens row's dead middle is ${m.lensFill.empty}px of ${m.lensFill.w}px (${(share * 100).toFixed(0)}%, budget 34%) — ${m.lensFill.gap}px of slack, ${m.lensFill.spans}px spanned`);
  }

  /* THE BAND IS NOT AN EMPTY BAR EITHER — the same budget again, on the head. It is the third
     object to fail this way and the first two are already bounded above, which is precisely
     why it is worth spending a third check on: "the elastic track is the left-aligned text
     box" is not an incident, it is the mistake this layout keeps making. Flat 34% across the
     whole matrix rather than banded — a phone head has five children in a 342px row and no
     slack to strand, so it passes on geometry rather than on an exemption. */
  if (!m.headFill) bad(`${at}: could not measure the tier band's head`);
  else {
    const share = m.headFill.gap / m.headFill.w;
    if (share > 0.34) {
      bad(`${at}: ${m.headFill.gap}px of the ${m.headFill.w}px tier band is empty (${(share * 100).toFixed(0)}%, budget 34%) — the head gave its elastic track to a text box again`);
    } else ok(`${at}: the band's dead middle is ${m.headFill.gap}px of ${m.headFill.w}px (${(share * 100).toFixed(0)}%, budget 34%)`);
    /* `.tb` clips, so this failure is INVISIBLE on screen: the road is simply cut off at the
       band's edge and the viewport sweep sees nothing, because the band is inside the window.
       The 0.5px tolerance is subpixel rounding, not slack. */
    if (m.headFill.escapes > 0.5) {
      bad(`${at}: the head's contents escape the band by ${m.headFill.escapes}px — .tb clips it, so this ships as a silently cut-off trophy road`);
    } else ok(`${at}: nothing escapes the tier band (${m.headFill.escapes}px)`);
  }

  if (m.mainW !== null && m.root && m.mainW >= 1360 && m.mainW <= 2000) {
    const share = m.root.w / m.mainW;
    if (share < 0.58) {
      bad(`${at}: the board is ${m.root.w}px on a ${m.mainW}px field (${(share * 100).toFixed(0)}%, floor 58%) — a ribbon down the middle of the page`);
    } else ok(`${at}: the board covers ${(share * 100).toFixed(0)}% of the ${m.mainW}px field (floor 58%)`);
  }

  /* THE HEAD IS ONE CARD, MEASURED FOUR WAYS. This replaces the old "the band and its filter
     sit closer together than the filter sits to the stage" ordering, and it is strictly
     stronger: that check inferred the grouping from a ratio between two gaps, and passed on a
     build where the two cards were OVERLAPPING. There is no gap left to get wrong. */
  if (!m.seam) ok(`${at}: no role lens on this board — the head is its two rows`);
  else if (!m.seam.nested) {
    bad(`${at}: the role lens is a SIBLING of the tier band, not a row inside it — two struck cards a few px apart is exactly what "combine the top 2 cards into 1" was about`);
  } else if (m.seam.toRowAbove === null || Math.abs(m.seam.toRowAbove) > 1) {
    bad(`${at}: the lens sits ${m.seam.toRowAbove}px from the row above it inside the band — a seam is 0`);
  } else if (Math.abs(m.seam.insetL) > 1 || Math.abs(m.seam.insetR) > 1) {
    bad(`${at}: the lens is inset ${m.seam.insetL}/${m.seam.insetR}px from the band's inner edges — a row that does not reach both sides leaves a notch in the card`);
  } else if (m.seam.radius > 0.5) {
    bad(`${at}: the lens still rounds its corners (${m.seam.radius}px) — a rounded box inside a rounded card reads as a chip lying on it, not as one of its rows`);
  } else if (m.seam.lip) {
    bad(`${at}: the lens still carries a hard lip of its own — that is this page's "I end here" mark, painted across the middle of a card where nothing ends`);
  } else ok(`${at}: the head is one card — the lens is flush (${m.seam.toRowAbove}px below the row above, ±${m.seam.insetL}/${m.seam.insetR}px to the band's edges) with no edge of its own`);

  /* AND THE TWO GAPS THAT REMAIN ARE VISIBLE ONES (2026-08-05, "cards and elements still
     crammed together in the laptop version — space out the silver league card, the
     all/OA/OT/PSA card, the podium card and the 4th-place card with each other").
     ⚠ MEASURED OPTICALLY, and that is the entire point. The ordering check this replaced
     passed on a column whose band and filter were TOUCHING: 6px of layout gap under a lip that
     paints 9px below the border box is −3px of visible space. Every number this file had about
     the rhythm agreed the column was correctly grouped while two of the four cards overlapped
     on screen — the same "precise measurement of the wrong thing" its own history warns about,
     this time about the wrong QUANTITY rather than the wrong device.
     A floor rather than a pin: the values still move freely per tier (13/9 · 15/11 · 19/15) and
     only the smallest is bounded. Desktop only — on a 390px phone every one of those pixels is
     a pixel of ladder, and the report was about a laptop.
     ⚠ ABOVE > BELOW, on every stacked tier. The stage's own CSS has claimed since 2026-08-04
     that "above > below is what makes it read as a stage rather than as the next card down" —
     the top three and rank 4 are one ranking, so the ceremony belongs to the board under it.
     Nothing checked it, and the three desktop tiers had all drifted the other way (17 above,
     18 below). A comment is not a constraint; this is. */
  /* ⚠ The two-column tier is reported SEPARATELY rather than through the line below it. There
     the ladder starts level with the head, so `stageToBoard` is a −390px non-quantity — and a
     green line reading "the column runs 11/−387.4px" is how a reader learns to stop reading
     the green lines. */
  if (!m.rhythm) bad(`${at}: could not measure the column's vertical rhythm`);
  else if (!m.rhythm.stacked) ok(`${at}: two columns — the stage sits beside the ladder, so only the ${m.rhythm.headToStage}px under the head is a gap`);
  else if (!(m.rhythm.headToStage > m.rhythm.stageToBoard)) {
    bad(`${at}: the stage has ${m.rhythm.headToStage}px above it and ${m.rhythm.stageToBoard}px below — a ceremony belongs to the ranking beneath it, so the air above must be the larger of the two`);
  } else if (vp.width >= 1024 && Math.min(...m.rhythm.optical) < 3) {
    bad(`${at}: the column's tightest VISIBLE gap is ${Math.min(...m.rhythm.optical)}px (optical ${m.rhythm.optical.join("/")} from layout ${m.rhythm.headToStage}/${m.rhythm.stageToBoard}, floor 3px on desktop) — a lip that paints below its own border box is the card's edge, not the gap`);
  } else ok(`${at}: the column runs ${m.rhythm.headToStage}/${m.rhythm.stageToBoard}px layout — ${m.rhythm.optical.join("/")}px visible once each lip is subtracted`);

  /* THE OUTLINE, on every object claiming a rung of the lip ladder. Rule 1 of the file's
     own recipe is a dark defining edge in --mat-ink — "never grey, because grey on a
     coloured fill reads as a CSS border". Three selectors were breaking it under a comment
     that said they did not, and `.lg-score` is instantiated once per row, so it was the
     single flattest thing on the board and there were twenty-seven of them. The alpha term
     is not pedantry: a 45%-alpha edge is a hairline that happens to be dark. */
  {
    const soft = m.outlines.filter((o) => {
      if (o.w === null) return false;                    // absent element, not a failure
      if (o.w < 1.5) return true;
      const c = rgb(o.c);
      return !c || (c[3] !== undefined && c[3] < 0.9) || lum(c) > 0.25;
    });
    if (soft.length) {
      bad(`${at}: ${soft.length} struck object(s) carry no defining outline: ` +
        soft.map((o) => `${o.sel} ${o.w}px ${o.c}`).join(" · "));
    } else ok(`${at}: every struck object on the board wears the dark outline`);
  }

  /* ── the promotion zone ─────────────────────────────────────────────────────────────
     A filled region with a labelled head and a struck cut, replacing a hairline with a
     caption. Exactly the top 7 are inside it — three on the stage, four in the list — and the
     cut lands above rank 8. */
  if (m.cutNextRank !== null) {
    bad(`${at}: the ladder drew a cut above rank ${m.cutNextRank} while the stage already holds every promoted rank — the same boundary, stated twice`);
  } else ok(`${at}: the cut is drawn once, by the stage`);
  const wantPromo = Array.from({ length: PROMOTE }, (_, i) => i + 1);
  if (String(m.promoRanks) !== String(wantPromo)) bad(`${at}: the promoted set is ${JSON.stringify(m.promoRanks)}, expected ${JSON.stringify(wantPromo)} — stage and ladder together`);
  else ok(`${at}: exactly ranks 1-${PROMOTE} are marked promoted across the stage and the ladder`);
  // The stage is inside the zone, so it must SAY so. Three students standing on a podium with
  // no promotion marking, above a gold region that starts at rank 4, reads as excluded.
  if (!m.podiumBlocks.every((s) => s.promo)) {
    bad(`${at}: podium places ${JSON.stringify(m.podiumBlocks.filter((s) => !s.promo).map((s) => s.place))} are not marked promoted, though the top ${PROMOTE} advance — the stage must carry the zone it sits in`);
  } else ok(`${at}: the stage carries the promotion marking it sits inside`);

  /* THE DECK'S BANNER carries the whole mechanic now, which is why nothing above the board
     needs a sentence about it. Asserted on CONTENT, not on the element existing — a generic
     label ("keep climbing!") would still render. */
  if (!m.deck) bad(`${at}: there is no deck under the stage`);
  else if (!m.deck.text) bad(`${at}: the stage says nothing — three students on a podium with no marking do not read as the ones who advance`);
  else if (!new RegExp(`top ${PROMOTE}\\b`, "i").test(m.deck.text)) bad(`${at}: the banner does not name the promotion count (top ${PROMOTE}): "${m.deck.text}"`);
  else if (!/Solar/.test(m.deck.text)) bad(`${at}: the banner does not name the division being climbed into: "${m.deck.text}"`);
  else ok(`${at}: the banner names both the cut and the destination`);

  /* THE DECK IS STRUCK — the same check that would have failed all four rejected passes,
     applied to the newest structural object: a real outline in a dark OPAQUE ink, and a lip
     that is an offset rather than a blur. */
  if (m.deck) {
    const dc = rgb(m.deck.c);
    // ⚠ `rgb()` here just scrapes the numbers out of the string, so an opaque `rgb(r, g, b)`
    // yields THREE of them and dc[3] is undefined. Reading alpha as `dc[3] > 0.95` would
    // therefore fail on every fully-opaque colour — which is the only kind that can pass.
    const dAlpha = dc && dc.length > 3 ? dc[3] : 1;
    if (!(m.deck.w >= 2 && dc && dAlpha > 0.95 && lum(dc) < 0.2)) {
      bad(`${at}: the deck's outline is ${m.deck.w}px of ${m.deck.c} — a structural object needs a dark opaque edge, not a hairline`);
    } else if (!/\b0px\b/.test(m.deck.shadow || "")) {
      bad(`${at}: the deck has no zero-blur lip — blur may describe the ground, never an edge`);
    } else ok(`${at}: the deck is struck (${m.deck.w}px outline + a hard lip)`);
  }

  /* ONE EDGE. Guarded to the STACKED layouts: the landscape-phone tier puts the ladder in a
     second column on purpose, where sharing the stage's edge is not a thing that can be true. */
  if (!m.edges) bad(`${at}: could not measure the column's edges`);
  else if (m.rhythm && !m.rhythm.stacked) ok(`${at}: two columns — the shared-edge bound does not apply`);
  else if (m.edges.spreadL > 1.5 || m.edges.spreadR > 1.5) {
    bad(`${at}: the ${m.edges.n} stacked blocks disagree on their edges by ${m.edges.spreadL}px left / ${m.edges.spreadR}px right — four widths on four centres is what "not spaced out nicely" measures as`);
  } else ok(`${at}: all ${m.edges.n} blocks share one edge (±${m.edges.spreadL}/${m.edges.spreadR}px)`);

  /* THE MULTIPLIER, made obvious. Measured as rendered AREA rather than as existence: the
     chip this replaced was 44x22 = 968px² and passed every check on the page. */
  if (!m.multBox) bad(`${at}: no multiplier module in the band`);
  else if (m.multBox.w * m.multBox.h < 1700) {
    bad(`${at}: the multiplier module renders ${m.multBox.w}x${m.multBox.h} — too small to be the reward it describes`);
  } else ok(`${at}: the multiplier module is ${m.multBox.w}x${m.multBox.h}`);

  /* THE ROAD says what each rung PAYS, on the tiers whose head has an elastic track wide
     enough to hold five labels. Below that the head cannot afford them and the module
     carries the number alone. */
  /* ⚠ Guarded on the LAYOUT, not on width. A 932px landscape phone is wider than 700 and
     runs the TWO-COLUMN tier, whose 356px left column is the one head that provably cannot
     afford five labels — the lock already records two failed attempts to widen it. */
  if (m.root.w >= 700 && m.rhythm && m.rhythm.stacked) {
    if (m.roadLabels !== 5) bad(`${at}: ${m.roadLabels} of 5 rungs say what they pay — a road that hides the prize is a row of dots`);
    else ok(`${at}: all five rungs say what they pay`);
  }
  if (!/×/.test(m.hookText)) bad(`${at}: the band never says what the next division pays — the reason to climb was readable only behind the (?)`);
  else ok(`${at}: the hook reads "${m.hookText}"`);

  /* COLOUR ON THE OBJECTS. The gauge is off below 700px (a phone rung has no dead middle to
     fill), so there are only rungs to sample above it. */
  if (m.root.w >= 700) {
    if (m.gaugeHues.bars >= 3 && m.gaugeHues.hues < 2) {
      bad(`${at}: ${m.gaugeHues.bars} gauges paint ${m.gaugeHues.hues} colour — the ladder is the flattest thing on a page that is meant to be loud`);
    } else ok(`${at}: the gauges paint ${m.gaugeHues.hues} role colours across ${m.gaugeHues.bars} rungs`);
  }

  /* The four objects beside the gauge on the same rung. The chroma floor is 32/255, and the
     number is chosen so the bound can FAIL on the build it describes: the grey it replaced
     (#DCE3EE) carries 18, and the five division tints carry 43–84 (platinum is the tightest,
     gold the widest). A floor of 12 would have passed the old plate — precise measurement of
     the wrong quantity, which is the mistake this file has now recorded three times. */
  if (m.rungPaint) {
    if (m.rungPaint.rkChroma === null) bad(`${at}: could not sample the rank token's fill — this check is testing nothing`);
    else if (m.rungPaint.rkChroma < 32) {
      bad(`${at}: the rank token's fill has ${m.rungPaint.rkChroma} of chroma — 27 grey plates is the ladder disagreeing with a page that is meant to be loud`);
    } else ok(`${at}: the rank token carries the division's tint (chroma ${m.rungPaint.rkChroma})`);

    if (m.rungPaint.faces >= 3 && m.rungPaint.faceLips < 2) {
      bad(`${at}: ${m.rungPaint.faces} avatar medallions paint ${m.rungPaint.faceLips} lip colour — the ring is the object the eye rests on and it is back to grey`);
    } else ok(`${at}: the medallion lips paint ${m.rungPaint.faceLips} role colours across ${m.rungPaint.faces} rungs`);
  }

  /* ── the tier band ──────────────────────────────────────────────────────────────────
     The head of the board is made of the division's metal, so climbing re-skins the page. */
  if (m.bandTier !== "volt") bad(`${at}: the tier band reads tier "${m.bandTier}", expected "volt" for division 2`);
  else {
    const band = rgb(m.bandBg);
    if (!band || band[3] === 0) bad(`${at}: the tier band has no resolvable colour (${JSON.stringify(m.bandBg)}) — declare a solid under the sweep or the band is unmeasurable`);
    else if (lum(band) > 0.86) bad(`${at}: the tier band's luminance is ${lum(band).toFixed(3)} — that is white, not metal; the head must carry the division's material`);
    else ok(`${at}: the tier band is cast in the division's metal (luminance ${lum(band).toFixed(3)})`);
  }

  /* AND THE ROW UNDER IT IS THE CONSOLE. A ceiling rather than a specific colour, so the
     faceplate can be re-cut without re-cutting this — what may not come back is a PALE readout,
     which is both the letterbox the report named and the surface on which this row's three
     inks measure 1.6-2.9:1. */
  {
    const con = rgb(m.readoutBg);
    if (!con || con[3] === 0) bad(`${at}: the band's readout has no resolvable colour (${JSON.stringify(m.readoutBg)}) — an undeclared fill makes every label on it unmeasurable`);
    else if (lum(con) > 0.2) bad(`${at}: the readout's luminance is ${lum(con).toFixed(3)} — the row under the faceplate is a dark console (ceiling 0.20); its inks are cut for that fill and read 1.6-2.9:1 on a pale one`);
    else ok(`${at}: the readout is a dark console (luminance ${lum(con).toFixed(3)})`);
  }

  /* THE CANVAS'S LAYER BOOKKEEPING — `repeat` must land on the tiling gradient and on nothing
     else. See the note where this is measured for why comparing list LENGTHS proves nothing. */
  if (!m.bgLayers) bad(`${at}: could not read the canvas's background layers`);
  else if (m.bgLayers.tiling.length !== 1) {
    bad(`${at}: the canvas has ${m.bgLayers.tiling.length} repeating gradient(s) in ${m.bgLayers.n} layers — the stripe is the only one that tiles, and this check keys off that`);
  } else if (m.bgLayers.repeated.join() !== m.bgLayers.tiling.join()) {
    bad(`${at}: background-repeat puts \`repeat\` on layer(s) [${m.bgLayers.repeated}] but the tiling gradient is layer ${m.bgLayers.tiling[0]} of ${m.bgLayers.n} — the list has CYCLED, so a bloom is tiling and the stripe is not`);
  } else ok(`${at}: \`repeat\` sits on the stripe and on nothing else (layer ${m.bgLayers.tiling[0]} of ${m.bgLayers.n})`);

  /* Five DISTINCT metals on the trophy road, sampled as painted colour. The rule this
     overturned was "division by luminance, never hue", which painted every rung gold;
     collapsing them back to one material is the regression, and it is invisible in a
     screenshot diff if only the CSS changes. */
  if (m.pips.length !== 5) bad(`${at}: the trophy road has ${m.pips.length} pips, expected 5`);
  else {
    const hues = new Set(m.pips.map((q) => q.bg));
    if (hues.size !== 5) bad(`${at}: the five divisions paint ${hues.size} distinct colour(s) — divisions are identified by material, not by luminance`);
    else ok(`${at}: five divisions paint five distinct metals`);

    /* THE PALETTE'S OWN RULE, measured on the road — the one place all five bases paint at
       once, so it is the only place SPREAD can be read at all. A per-division probe sees one
       hue and can never answer "do these five crowd each other". */
    const hs = m.pips.map((q) => { const c = rgb(q.bg); return c && c[3] !== 0 ? hue(c) : null; });
    const mute = hs.map((h, i) => (h === null ? i + 1 : 0)).filter(Boolean);
    if (mute.length) {
      bad(`${at}: rung(s) ${mute.join(", ")} paint no resolvable hue — the spread and separation rules are testing nothing here`);
    } else {
      const sp = spread(hs);
      if (sp < SPREAD_MIN) {
        bad(`${at}: the five rungs occupy ${sp.toFixed(0)}° of the wheel (${hs.map((h) => h.toFixed(0)).join("°, ")}°) — under the ${SPREAD_MIN}° floor, so the ladder is crowded into a slice and the hues fight each other`);
      } else ok(`${at}: the five rungs spread across ${sp.toFixed(0)}° of the wheel`);

      const ls = m.pips.map((q) => lum(rgb(q.bg)));
      let collapsed = 0;
      for (let i = 0; i < hs.length; i++) {
        for (let j = i + 1; j < hs.length; j++) {
          const dh = hueGap(hs[i], hs[j]), dl = Math.abs(ls[i] - ls[j]);
          if (dh < HUE_MIN && dl < LUM_MIN) {
            collapsed++;
            bad(`${at}: rungs ${i + 1} and ${j + 1} collapse — ${dh.toFixed(0)}° apart in hue (floor ${HUE_MIN}) AND ${dl.toFixed(2)} apart in luminance (floor ${LUM_MIN}); a rung must be told apart by one or the other`);
          }
        }
      }
      if (!collapsed) ok(`${at}: no two of the five rungs collapse into each other`);
    }

    // Earned / current / locked must all read, and not by hue alone.
    const now = m.pips.find((q) => q.state === "now");
    const past = m.pips.find((q) => q.state === "past");
    const next = m.pips.find((q) => q.state === "next");
    /* ⚠ THE CRITERION CHANGED ON 2026-08-06, from element OPACITY to painted luminance.
       "Locked is ≥0.15 dimmer" was satisfied by `opacity: .74` — and a faded element
       composites its fill AND its label into whatever is behind it, so what the reader
       actually saw was a gold rung rendering khaki over the Volt band and a Prism rung
       rendering sage over Solar, with ink to match. This gate passed on all of it, because
       0.74 is a number and the colour on screen was not one anybody measured.
       The report was "the texts in the tier color card ... are somewhat camouflaged and not
       readable". A luminance floor on the actual fill is the same claim about the same thing,
       made where it can be checked — and the opacity clause below is what stops a later pass
       reintroducing the fade underneath it. */
    const litLum = (q) => lum(rgb(q.bg));
    const sheer = m.pips.filter((q) => q.op < 1);
    if (!now || !past || !next) bad(`${at}: the trophy road shows only ${[...new Set(m.pips.map((q) => q.state))].join("/")} — earned, current and locked must all be present`);
    else if (now.w <= past.w) bad(`${at}: the current division is not larger than an earned one (${now.w}px vs ${past.w}px)`);
    else if (sheer.length) {
      bad(`${at}: ${sheer.length} rung(s) render at opacity <1 (${sheer.map((q) => `${q.state} ${q.op}`).join(", ")}) — a faded rung mixes its fill and its ink into the band, which is the camouflage this road was rebuilt to remove and a surface no contrast probe can resolve`);
    } else {
      const lit = Math.min(...m.pips.filter((q) => q.state !== "next").map(litLum));
      const dark = Math.max(...m.pips.filter((q) => q.state === "next").map(litLum));
      if (dark > lit - 0.10) {
        bad(`${at}: the brightest locked rung is luminance ${dark.toFixed(3)} against ${lit.toFixed(3)} for the dimmest reached one — a rung you have not earned must be visibly UNLIT (floor: 0.10 of luminance), and it may not buy that with opacity`);
      } else ok(`${at}: earned / current / locked differ by size and by painted luminance (${lit.toFixed(3)} vs ${dark.toFixed(3)}), every rung opaque`);
    }
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

  /* WHAT THE TIER PAYS, on the band itself. Until 2026-08-04 a division only decided who you
     were ranked against; it now multiplies every Lumen earned anywhere in the app, and a
     reward a student cannot see is an accounting detail. Asserted at EVERY viewport because
     it is a fifth cell in a head row that already fits crest, name, pips and (?) — the
     phone is where it gets squeezed out, and it is the phone that matters most. */
  if (m.mult !== `×${String(LADDER[1])}`) {
    bad(`${at}: the band shows the multiplier as ${JSON.stringify(m.mult)}, expected "×${LADDER[1]}"`);
  } else ok(`${at}: the band states what the tier pays — ${m.mult}`);

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
        [/Ember.*Prism/i, "the five divisions in order"],
      ];
      const gaps = want.filter(([re]) => !re.test(txt)).map(([, why]) => why);
      if (gaps.length) bad(`the league rules never explain: ${gaps.join("; ")}`);
      else ok("the (?) opens rules covering weekly scoring, the Monday close, no-demotion and all five divisions");

      /* THE TROPHY ROAD. A division now MULTIPLIES every Lumen earned anywhere in the app,
         which is the first time a tier has done anything but sort you — so the sheet has to
         carry the real ladder, and it is rendered from the payload rather than typed into
         the copy. Asserted against BOARD.division_multipliers so retuning the economy
         updates this test's expectation with it. */
      const road = await p.locator('[data-testid="multiplier-road"] .rr-x').allTextContents();
      const wantRoad = LADDER.map((m) => `×${String(m)}`);
      if (road.join("|") !== wantRoad.join("|")) {
        bad(`the rules sheet's multiplier road reads ${JSON.stringify(road)}, expected ${JSON.stringify(wantRoad)}`);
      } else ok(`the rules sheet shows the real ladder ${wantRoad.join(" ")}`);

      // ...and it says which rung is YOURS. A road that does not locate you is a price list.
      const mine = p.locator('[data-testid="multiplier-road"] .rules-rung[data-state="now"]');
      if (await mine.count() !== 1) bad("the multiplier road does not mark the viewer's own division");
      else if (!/Volt/i.test((await mine.textContent()) ?? "")) bad("the multiplier road marks the wrong division as the viewer's");
      else ok("the multiplier road marks the viewer's own rung");

      // The forfeit carve-out, stated where a student will ask about it.
      if (!/forfeit/i.test((await p.locator(".sheet").textContent()) ?? "")) {
        bad("the rules never say a forfeit is NOT multiplied — the one question the multiplier invites");
      } else ok("the rules state that only earnings are multiplied");

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

/* ── 5b) THE UNDERFILLED STAGE, the only board that still draws the cut in the LADDER ──
   Below three entries splitPodium refuses the stage, so the promoted rank has nowhere to be
   except a row — which is exactly why the cut is withheld CONDITIONALLY rather than deleted.
   Without this case the zone, the line and the gold rows would keep their CSS and lose their
   gate: paint that nothing ever measures again. */
{
  const two = {
    ...BOARD,
    entries: ENTRIES.slice(0, 2).map((e, i) => ({ ...e, is_you: i === 0 })),
    pool_size: 2, promote_count: 1,
  };
  const ctx = await boardCtx(b, DESKTOP, { board: two });
  const p = await openBoard(ctx, { podium: false });
  if (await p.locator('[data-testid="podium"]').count() !== 0) {
    bad("a two-student cohort built a stage — a three-place podium holding two is a hole, not a ceremony");
  } else ok("below three entries there is no stage");
  if (await p.locator('[data-testid="promotion-line"]').count() !== 1) {
    bad("the underfilled board drew no cut — with no stage to carry it, the ladder is the only place the boundary can be");
  } else ok("the cut still draws when the podium is withheld");
  const promoRows = await p.locator('.lg-item[data-promo]').count();
  if (promoRows !== 1) bad(`the underfilled board marked ${promoRows} promoted rows, expected 1`);
  else ok("the underfilled board marks its one promoted row");
  await ctx.close();
}

/* ── 5c) EVERY DIVISION'S BAND AND FIELD, not just the one the fixture mounts ──────────
   ⚠ This file pins `division: 2`, so for its whole life the contrast sweep probed ONE band and
   nothing else — four of the five were paint that no check had ever read. It shipped a real
   defect: `.tb-league` at #2E3440 on the old bronze band (#CE8746) measured 4.27:1, under the
   same 4.5 floor enforced everywhere else on the page, under a comment added specifically to
   fix that label's contrast.

   A gate pinned to one fixture only tests that fixture. The band, the trophy road, the plinths
   and the whole canvas are per-division; this mounts all five and re-runs the claims that are
   actually per-tier — the head's ink is readable, the band is still material rather than white,
   and (2026-08-06) the FIELD is genuinely the division's own rather than one shared surface
   with a tinted bloom on it. Cheap, because it needs no geometry and no viewport matrix. */
{
  const NAMES = ["Ember", "Volt", "Solar", "Nova", "Prism"];
  const fields = [];
  for (let d = 1; d <= 5; d++) {
    const ctx = await boardCtx(b, DESKTOP, {
      /* ⚠ promote_count IS 0 AT THE SUMMIT, and spreading BOARD's 3 across all five was the
         fixture lying about the one division it exists to cover. Both `/api/leaderboard` and
         `/api/home` send `0 if division >= TOP_DIVISION` (student.py, home.py) — Prism
         promotes nobody — so a sweep that hands the summit a 3 renders a board the server
         cannot produce and never sees what a real Prism student sees. */
      board: { ...BOARD, division: d, division_name: NAMES[d - 1], division_multiplier: LADDER[d - 1],
               promote_count: d >= NAMES.length ? 0 : BOARD.promote_count },
    });
    const p = await openBoard(ctx);
    const seen = await p.evaluate(() => {
      const backdropOf = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const c = getComputedStyle(n).backgroundColor;
          const m = c.match(/[\d.]+/g)?.map(Number);
          if (m && (m[3] === undefined || m[3] > 0.92)) return c;
        }
        return null;
      };
      /* EVERY RUNG'S LABEL, on every division — the five smallest words in the head and the
         ones the 2026-08-06 report was actually about. They could not be probed before: a
         locked rung was `opacity: .74`, so its label's real backdrop was a composite of plate
         and band that `backdropOf` resolves to the plate's DECLARED colour and the eye never
         sees. Now every rung is an opaque solid, so what this measures is what renders.
         Collected from the DOM rather than by selector so a division at either end of the
         ladder (Ember has no earned rung, Prism no locked one) probes five either way. */
      const rungs = [...document.querySelectorAll(".tb-pip")].map((pip, i) => {
        const px = pip.querySelector(".tb-px");
        if (!px || getComputedStyle(px).display === "none") return null;
        return { sel: `rung ${i + 1} (${pip.dataset.state})`, color: getComputedStyle(px).color, on: backdropOf(px) };
      }).filter(Boolean);
      const now = document.querySelector('.tb-pip[data-state="now"]');
      // The head's own type, plus the numerals that land ON a plinth's metal.
      return [".tb-name", ".tb-league", ".pod-num"].map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { sel, color: null, on: null };
        return { sel, color: getComputedStyle(el).color, on: backdropOf(el) };
      }).concat(rungs, [
        { sel: "__band", color: null, on: getComputedStyle(document.querySelector(".tb")).backgroundColor },
        { sel: "__field", color: null, on: getComputedStyle(document.querySelector(".aurora-main")).backgroundColor },
        // What the CURRENT rung stands on, and what it is painted — the pair that was 1.3:1.
        { sel: "__bed", color: now ? getComputedStyle(now).backgroundColor : null,
          on: backdropOf(document.querySelector(".tb-pips")) },
      ]);
    });
    fields.push(seen.find((t) => t.sel === "__field").on);
    const band = rgb(seen.find((t) => t.sel === "__band").on);
    if (!band || band[3] === 0) bad(`${NAMES[d - 1]}: the tier band has no resolvable colour`);
    else if (lum(band) > 0.86) bad(`${NAMES[d - 1]}: the band's luminance is ${lum(band).toFixed(3)} — that is white, not a division`);
    else ok(`${NAMES[d - 1]}: the band is cast in its division (luminance ${lum(band).toFixed(3)})`);

    /* The band is the largest statement of the division on the page, and it is authored from
       --f-lo rather than from --pm — a separate site from the road above, so a drift can hit
       one and not the other. Both are gated for the same reason the crest is called out in
       Tiers.tsx: this colour has eight authors. */
    const rung = rgb(seen.find((t) => t.sel === "__bed")?.color);
    if (band && band[3] !== 0 && rung && rung[3] !== 0) {
      const hb = hue(band), hr = hue(rung);
      if (hb === null || hr === null) {
        bad(`${NAMES[d - 1]}: the band or its rung is neutral (band ${seen.find((t) => t.sel === "__band").on}, rung ${seen.find((t) => t.sel === "__bed").color}) — a division has a hue, and this check needs both to have one`);
      } else if (hueGap(hb, hr) > 12) {
        bad(`${NAMES[d - 1]}: the band sits at ${hb.toFixed(0)}° and its own rung on the road at ${hr.toFixed(0)}° — ${hueGap(hb, hr).toFixed(0)}° apart, so the two authoring sites have drifted and one division is painting two colours`);
      } else ok(`${NAMES[d - 1]}: the band and its rung agree on the division's hue (${hb.toFixed(0)}° / ${hr.toFixed(0)}°)`);
    }

    const probes = seen.filter((t) => !t.sel.startsWith("__"));
    const blind = probes.filter((t) => !t.color || !t.on).map((t) => t.sel);
    if (blind.length) bad(`${NAMES[d - 1]}: could not resolve ${blind.join(", ")} — this check is testing nothing`);
    else {
      const dim = probes.map((t) => ({ ...t, r: contrast(rgb(t.color), rgb(t.on)) })).filter((t) => t.r < 4.5);
      if (dim.length) {
        bad(`${NAMES[d - 1]}: ${dim.length} style(s) below 4.5:1 on this division's own metal: ` +
          dim.map((t) => `${t.sel} ${t.color} on ${t.on} ${t.r.toFixed(2)}:1`).join(" · "));
      } else ok(`${NAMES[d - 1]}: all ${probes.length} head styles clear 4.5:1 on this division's metal`);
    }

    /* THE CURRENT RUNG MUST NOT BE THE BAND IT SITS ON. Both are painted the division's own
       colour by design — that is what "hue is identity" means — so on every one of the five
       boards the road's one load-bearing plate rendered its own hue on its own hue: 1.3:1,
       held together by a white ring and nothing else. This is an OBJECT floor (3:1), not a
       text one; what satisfies it is the trough under the plates, and this is the check that
       fails the moment a later pass takes the trough away and puts the road back on the band. */
    const bed = seen.find((t) => t.sel === "__bed");
    const bc = rgb(bed?.color), bb = rgb(bed?.on);
    if (!bc || !bb || bc[3] === 0 || bb[3] === 0) {
      bad(`${NAMES[d - 1]}: the current rung or the surface under it has no resolvable colour (${bed?.color} on ${bed?.on}) — the road must stand on an opaque bed or this is testing nothing`);
    } else if (contrast(bc, bb) < 3) {
      bad(`${NAMES[d - 1]}: the current rung is ${contrast(bc, bb).toFixed(2)}:1 against what it stands on (${bed.color} on ${bed.on}) — the one plate a student has to find is camouflaged against its own band`);
    } else ok(`${NAMES[d - 1]}: the current rung reads ${contrast(bc, bb).toFixed(2)}:1 against the road's bed`);

    const field = rgb(seen.find((t) => t.sel === "__field").on);
    if (!field || field[3] === 0) bad(`${NAMES[d - 1]}: the canvas has no resolvable base colour — the stack must end in an opaque light solid or every glyph on it measures against nothing`);
    else if (lum(field) < 0.7) bad(`${NAMES[d - 1]}: the canvas's base luminance is ${lum(field).toFixed(3)} — this is the LIGHT Aurora canvas (floor 0.7), and the dark stage has been rejected twice`);
    else ok(`${NAMES[d - 1]}: the field is a light solid (luminance ${lum(field).toFixed(3)})`);

    /* ── THE FIELD IS QUIET (2026-08-06, "too over stimulating") ────────────────────────
       The complaint was about QUANTITY, not brightness: the field carried the division's hue
       at .42, a partner hue at .34 in both top corners, gold footlights at .46 and the
       division's stripes at .10 — four hue families on the largest surface in the app, so the
       objects standing on it had nothing to be loud against. Saturation was ambient, and
       ambient saturation is the definition of over-stimulating.

       Gated on the TOKENS rather than on a screenshot sample, for the reason this file keeps
       relearning: a pixel probe goes vacuous the moment a bloom moves, and an alpha is exactly
       the number the design decision is written in. --arena-glow must be gone entirely, not
       merely faint — a partner hue at .05 is a smudge nobody asked for rather than a quieter
       version of a counter-note. */
    const arena = await p.evaluate(() => {
      const cs = getComputedStyle(document.querySelector(".aurora-main"));
      /* ⚠ READ BOTH FORMS. A custom property is not resolved to a colour by the engine — it
         computes to its token text — so what this reads is whatever the BUILD left behind, and
         the minifier rewrites `rgba(255, 99, 32, .15)` to `#ff632026`. A probe that only knows
         rgba() finds a single number in that string and falls back to opaque.
         It failed loudly here, because the fallback (1) is over a ceiling. Had this been a
         FLOOR it would have passed vacuously on every division — which is the same class of
         hole as measuring a gradient with no background-color. Parse the authored form and the
         shipped form, always. */
      const a = (v) => {
        const s = cs.getPropertyValue(v).trim();
        if (!s) return null;
        const hex = s.match(/^#([0-9a-f]{3,8})$/i)?.[1];
        if (hex) {
          if (hex.length === 8) return parseInt(hex.slice(6), 16) / 255;
          if (hex.length === 4) return parseInt(hex[3] + hex[3], 16) / 255;
          return 1;                                     // #RGB / #RRGGBB are opaque
        }
        const m = s.match(/[\d.]+/g)?.map(Number);
        return m ? (m.length > 3 ? m[3] : 1) : null;
      };
      return { wash: a("--arena-wash"), stripe: a("--arena-stripe"), glow: a("--arena-glow") };
    });
    if (arena.wash === null || arena.stripe === null) {
      bad(`${NAMES[d - 1]}: --arena-wash/--arena-stripe do not resolve — the quiet-field rule is testing nothing`);
    } else if (arena.wash > 0.18 || arena.stripe > 0.06 || arena.glow !== null) {
      bad(`${NAMES[d - 1]}: the field is loud again — wash ${arena.wash} (ceiling 0.18), stripe ${arena.stripe} (ceiling 0.06)` +
        (arena.glow !== null ? `, and --arena-glow is back at ${arena.glow} (it must be unset; the partner bloom was one of the two hue families this pass removed)` : ""));
    } else ok(`${NAMES[d - 1]}: the field is quiet — one hue, wash ${arena.wash} / stripe ${arena.stripe}, no partner bloom`);

    /* THE DECK'S PROMOTION MODULE, ON EVERY RUNG (2026-08-06). The module is authored for a
       division with one above it — eyebrow, the destination in display type, and the
       no-relegation line — and the summit has neither a destination to name nor a promotion
       to offer. Both halves of that went unseen because §5c is the only place all five mount:
       at Prism `nextDivisionName` returns null, so the middle line vanished and the card
       centred a hole; and with the server's real `promote_count: 0` the module did not render
       AT ALL, leaving the 264px flank beside a 336px stage empty.

       Three claims, and each is a way the card can be wrong rather than merely different:
         · it EXISTS — an empty flank is the summit-only state the fixture used to hide;
         · no line renders EMPTY — the reported gap, measured on text rather than on a
           screenshot, so it fails whether the span is absent or present-and-blank;
         · it does not offer a promotion the summit cannot pay. Asserted on CONTENT for the
           same reason the division-2 banner check is: a generic module still renders. */
    const promo = await p.evaluate(() => {
      const el = document.querySelector('[data-testid="podium-promo"]');
      // The line spans are the module's direct children (the ▲ lives INSIDE the eyebrow), so
      // this is the card's lines and nothing else.
      return el ? [...el.children].map((c) => ({
        cls: `${c.className}`, text: `${c.textContent ?? ""}`.replace(/\s+/g, " ").trim(),
      })) : null;
    });
    const full = promo?.map((l) => l.text).join(" ") ?? "";
    if (!promo) {
      bad(`${NAMES[d - 1]}: the deck states no promotion mechanic — the flank beside the stage renders empty`);
    } else if (promo.some((l) => !l.text)) {
      bad(`${NAMES[d - 1]}: the deck's module renders ${promo.filter((l) => !l.text).length} EMPTY line(s) ` +
        `(${promo.map((l) => `${l.cls}="${l.text}"`).join(" · ")}) — a blank row in a centred card is a hole in it`);
    } else if (d >= NAMES.length && /top \d+ promote/i.test(full)) {
      bad(`${NAMES[d - 1]}: the summit's module still offers a promotion ("${full}") — nothing is above Prism and promote_count is 0`);
    } else if (d < NAMES.length && !new RegExp(NAMES[d]).test(full)) {
      bad(`${NAMES[d - 1]}: the module does not name ${NAMES[d]}, the division being climbed into: "${full}"`);
    } else ok(`${NAMES[d - 1]}: the deck's module states ${promo.length} full lines ("${full}")`);

    await ctx.close();
  }

  /* THE FIELD IS THE DIVISION'S, and this is the claim the 08-06 pass actually makes. Before
     it, one base (#FFFBF4) served all five and only a bloom moved — so "climbing re-skins the
     screen" was true of a wash and false of the page. Five distinct bases is the cheapest
     honest test of it, and it is the one a later pass simplifying the tokens back to one
     shared value would trip immediately. */
  if (fields.some((f) => !f)) bad("could not sample every division's field — this check is testing nothing");
  else if (new Set(fields).size !== 5) {
    bad(`the five divisions paint ${new Set(fields).size} distinct canvas base(s) — the field is meant to BE the division, not one surface with a tint over it`);
  } else ok(`five divisions paint five distinct fields (${fields.join(" · ")})`);
}

/* ── 6) the promotion zone is NOT drawn on a role-filtered view ──────────────────────── */
{
  const ctx = await boardCtx(b, DESKTOP);
  const p = await openBoard(ctx);
  /* The unfiltered board states the cut on the DECK now, not as a bar in the ladder: the
     podium holds every promoted rank, so the bar would repeat a boundary stated 8px above
     it. What must still vanish under a filter is the marking of any kind. */
  if (await p.locator('[data-testid="podium-promo"]').count() !== 1) bad("no promotion statement on the unfiltered board");
  else {
    await p.locator('.lb-filter .lb-chip:has-text("OT")').click();
    await p.waitForTimeout(500);
    const left = await p.locator('[data-testid="promotion-line"], [data-testid="promotion-zone"], [data-testid="podium-promo"]').count();
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
                   from_division_name: "Volt", to_division_name: "Solar" };
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
