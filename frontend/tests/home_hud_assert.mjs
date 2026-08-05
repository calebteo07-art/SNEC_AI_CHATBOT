/* The Home HUD gate (plan 2026-08-05 §Task 4). Written BEFORE the deck exists, so it fails
   for the right reason and Tasks 5-10 have a target rather than an argument.

   Six bounds, each one a defect this screen can actually ship:

     1. THE FOLD BUDGET. Five objects, all above y=844 on a 390x844 phone. This is the
        League's "ranks visible >= 8" discipline: a measured budget beats a debate about
        layout, and it says nothing about HOW the top of the page is built, so it survives
        the next rebuild instead of pinning this one in place.
     2. A SEALED CHEST DOES NOT LEAK ITS DROP. GET /api/home returns `key` and `label` even
        when the chest is unclaimed — the roll is a pure function of (student_id, date), so
        the endpoint computes it either way. That is harmless as data and fatal as UI, and
        it is INVISIBLE IN CODE REVIEW, because the drop just sits there in props until
        someone renders it. Checked in the text AND in every attribute and in the raw HTML:
        a leak can hide in a `title`, an `aria-label` or a `data-` attribute just as easily.
     3. NO HAIRLINES ON THE DECK. Chrome snaps used border-width to whole device pixels, so
        a `1.5px` declaration RENDERS as the banned 1px hairline and getComputedStyle
        reports "1px". Measure the USED value, never the declaration.
     4. EVERY STRUCK OBJECT ENDS IN A SOLID `background-color`. A gradient-only box has no
        computed background-color, so a contrast probe walks past it to the page and
        measures the wrong surface — the check reads green having measured nothing.
     5. 0px HORIZONTAL PAGE OVERFLOW at 390px, and NOTHING ON THE DECK ROTATES ITS OWN BOX.
        A rotated square reports a bounding box 1.41x its width and escapes an overflow
        sweep even under `overflow:hidden` — clipping stops the PAINT, not
        getBoundingClientRect. (The coverflow's banked cards are deliberately out of scope:
        they live outside `.hm-deck`.)
     6. TOUCH TARGETS >= 44px on every claim button and on the chest.

   Plus a second page load under `prefers-reduced-motion: reduce`: the chest's shake
   freezes, but THE COUNTDOWNS KEEP TICKING. Reduced motion is about vestibular safety, not
   about withholding information, and a frozen clock lies about the time.

   ⚠ AN EMPTY SWEEP READS GREEN. `[...querySelectorAll(sel)].filter(...)` over a selector
   that matches NOTHING returns [], and an empty array passes every "no offenders" bound in
   this file in total silence — which is exactly how a harness written before its subject
   turns into a false gate the day it goes green for the wrong reason. So the STRUCK census
   below is its OWN bound, run first, and bounds 5 and 6 fail explicitly when their scope is
   empty rather than reporting a pass they never earned.

   ⚠ A CRASH WITH NO `FAIL:` LINE IS NOT A RED TEST — on this dev box it means the harness
   or the box is broken (ERR_NETWORK_IO_SUSPENDED, boot stalls). The guards at the bottom
   turn a throw or an unhandled rejection into a legible FAIL line for exactly that reason.

   Run:  node frontend/tests/home_hud_assert.mjs [base]
         (HARNESS_PORT=3999 node frontend/tests/home_hud_assert.mjs  — concurrent sessions)
*/
import { chromium } from "playwright";
import { student, seededContext, J } from "./_mocks.mjs";
import { installReachability } from "./_layout.mjs";

const base = process.argv[2] ?? `http://127.0.0.1:${process.env.HARNESS_PORT ?? 3000}`;
let failed = 0;
const ok = (m) => console.log("PASS:", m);
const bad = (m) => { console.error("FAIL:", m); failed++; };

/* A label that appears NOWHERE else in this app or its fixtures, so the leak bound cannot
   pass by accident and cannot fail on a coincidence. */
const SECRET = "ZZ-CHEST-SECRET-ZZ";
const PHONE = { width: 390, height: 844 };

/* Every object the material bounds sweep, and why each is guaranteed to match at least one
   element once the deck is built — which is what makes the census a real bound and not a
   formality. See the empty-sweep warning above. */
const STRUCK = [
  [".hm-deck", "the deck wrapper (Task 9)"],
  [".hm-board", "the quest board (Task 6)"],
  [".hm-chest", "the chest tile (Task 7)"],
  [".hm-claim", "a claim button — the mock ships quest 0 complete && !claimed (Task 6)"],
  [".hm-boost", "the boost chip — the mock ships boost.multiplier = 2 (Task 5)"],
  [".hm-chip", "the level chip (ships today)"],
  [".hm-lb", "the rank strip (ships today as the leaderboard pill; Task 8 restrikes it)"],
];
const STRUCK_SEL = STRUCK.map(([s]) => s).join(", ");

/* The payload, built per request so the boost stamp is always live.
   Three quests, one in each state the board must render — complete-and-claimable (which is
   what guarantees a `.hm-claim` exists to measure), claimed, and in progress.
   ⚠ The boost has ~25 MINUTES left, not hours, and that is load-bearing: formatCountdown
   renders "M:SS" under an hour and "Nh MMm" over it, and an hours-long boost would not
   change its text within the reduced-motion pass's 1.4s window — a frozen clock and a
   coarse one would be indistinguishable. */
const homePayload = () => ({
  quests: [
    { kind: "adaptive", title: "Clear 2 decks in Gonioscopy", target: 2, reward_xp: 40, progress: 2, complete: true, claimed: false },
    { kind: "checkin", title: "Check in today", target: 1, reward_xp: 20, progress: 1, complete: true, claimed: true },
    { kind: "station", title: "Finish an OSCE station", target: 1, reward_xp: 60, progress: 0, complete: false, claimed: false },
  ],
  chest: { claimed: false, key: "xp2x", label: SECRET },
  boost: { multiplier: 2, until: new Date(Date.now() + 25 * 60_000).toISOString() },
  league: { rank: 7, pool_size: 24, promote_count: 3, division_name: "Silver", xp_to_promotion: 120 },
});

/* One authenticated phone boot. `hasTouch`/`isMobile` are not decoration: the phone tiers
   gate on `(pointer: coarse)`, and a default Playwright context is a FINE pointer — those
   tiers would never render and the fold budget would be measured against the desktop ramp
   (see the mobile-audit fine-pointer memory). */
async function boot(b, extra = {}) {
  const ctx = await seededContext(b, base, student, PHONE, { hasTouch: true, isMobile: true, ...extra });
  await installReachability(ctx);
  await ctx.addInitScript(() => {
    window.__nm = (e) => e.tagName.toLowerCase()
      + (e.getAttribute("data-testid") ? `[${e.getAttribute("data-testid")}]` : "")
      + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/)[0] : "");
  });
  /* Registered AFTER seededContext so it beats the glob catch-all in _mocks.mjs that 404s
     every unmocked /api route — last route registered wins. /api/progress comes from that
     shared fixture on purpose (it is not re-declared here), so
     this harness cannot drift from the one every other Home gate is measured against; its
     streak_detail already carries done_today:false, which is what puts the streak at risk. */
  await ctx.route("**/api/home", (r) => r.fulfill(J(homePayload())));
  const p = await ctx.newPage();
  await p.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-testid="home-root"]', { timeout: 20000 });
  /* Soft: the deck does not exist yet, so this must not hang the run — but once it does,
     racing its mount would report a fold failure that is really a timing failure. */
  await p.waitForSelector('[data-testid="hud-status"]', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(700);
  return { ctx, p };
}

const b = await chromium.launch();
try {
  const { ctx, p } = await boot(b);

  // ── 1. the fold budget ─────────────────────────────────────────────────────────────
  /* Measured in ONE evaluate rather than five locator.boundingBox() calls. Same rect, but
     a locator AUTO-WAITS: while the deck does not exist, each missing testid burns the full
     30s default timeout and the fifth one never reports at all, because the first throw
     ends the run. A harness written before its subject has to be able to say "not rendered"
     instantly, five times over. */
  console.log(`\n══ ${PHONE.width}x${PHONE.height} · the fold budget ══`);
  const FOLD = ["hud-status", "quest-row-0", "quest-row-1", "quest-row-2", "chest-tile"];
  const boxes = await p.evaluate((ids) => Object.fromEntries(ids.map((id) => {
    const e = document.querySelector(`[data-testid="${id}"]`);
    if (!e) return [id, null];
    const r = e.getBoundingClientRect();
    return [id, { y: r.top, w: r.width, h: r.height }];
  })), FOLD);
  for (const id of FOLD) {
    const box = boxes[id];
    if (!box) bad(`${id} is not rendered at all`);
    else if (box.w < 2 || box.h < 2) bad(`${id} is rendered but has no box (${Math.round(box.w)}x${Math.round(box.h)})`);
    else if (box.y + box.h > PHONE.height) bad(`${id} falls below the ${PHONE.width}x${PHONE.height} fold (bottom ${Math.round(box.y + box.h)})`);
    else ok(`${id} is above the fold (bottom ${Math.round(box.y + box.h)})`);
  }

  // ── 2. a sealed chest does not leak its drop ───────────────────────────────────────
  console.log("\n══ the sealed chest ══");
  const leak = await p.evaluate((s) => {
    const attrs = [];
    for (const e of document.querySelectorAll("*")) {
      for (const a of e.attributes) if (a.value.includes(s)) attrs.push(`${window.__nm(e)}[${a.name}]`);
    }
    return {
      chest: Boolean(document.querySelector('[data-testid="chest-tile"]')),
      text: document.body.innerText.includes(s),
      attrs: attrs.slice(0, 6),
      html: document.documentElement.innerHTML.includes(s),
    };
  }, SECRET);
  const where = [leak.text && "visible text", leak.attrs.length && `attributes (${leak.attrs.join(", ")})`,
    leak.html && "markup"].filter(Boolean);
  /* "Nothing leaked" is only worth printing when there IS a chest to leak. A page with no
     chest tile passes this bound trivially, which is the same vacuous green the census
     guards — so say so instead of banking it. */
  if (!leak.chest) bad("the leak bound cannot run: [data-testid=chest-tile] is not rendered, so a page with no chest trivially reveals no drop — failing it instead of banking an unearned pass");
  else if (where.length) bad(`the SEALED chest leaked its drop "${SECRET}" into the DOM via ${where.join(" + ")} — GET /api/home hands the client key+label before the claim (the roll is pure over student+date); render it only through chestReveal()`);
  else ok("the sealed chest reveals nothing — no leak in text, attributes or markup");

  // ── the STRUCK census: an empty sweep must never read green ────────────────────────
  console.log("\n══ struck material ══");
  const counts = await p.evaluate((ss) => Object.fromEntries(ss.map((s) => [s, document.querySelectorAll(s).length])), STRUCK.map(([s]) => s));
  const absent = STRUCK.filter(([s]) => counts[s] === 0);
  if (absent.length) bad(`STRUCK census — ${absent.map(([s, why]) => `${s} matched 0 elements (${why})`).join("; ")}. The bounds below filter over what they find, and a filter over nothing returns nothing, so this is failed EXPLICITLY rather than passing in silence.`);
  else ok(`STRUCK census: ${STRUCK.map(([s]) => `${s}x${counts[s]}`).join("  ")}`);

  // ── 3. no hairlines ────────────────────────────────────────────────────────────────
  const thin = await p.evaluate((sel) => {
    const out = [];
    for (const e of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(e);
      for (const side of ["Top", "Right", "Bottom", "Left"]) {
        const used = cs[`border${side}Width`];
        const w = parseFloat(used);
        if (w > 0 && w < 2) out.push(`${window.__nm(e)} border-${side.toLowerCase()}=${used}`);
      }
    }
    return out.slice(0, 8);
  }, STRUCK_SEL);
  if (thin.length) bad(`struck objects rendering a hairline: ${thin.join(", ")} — these are USED widths (Chrome snaps to whole device pixels, so a 1.5px declaration lands here as 1px)`);
  else ok("no struck object renders a border under 2px");

  // ── 4. every struck object ends in a solid ─────────────────────────────────────────
  const noSolid = await p.evaluate((sel) => {
    const out = [];
    for (const e of document.querySelectorAll(sel)) {
      const bg = getComputedStyle(e).backgroundColor;
      const n = (bg.match(/[\d.]+/g) ?? []).map(Number);
      const alpha = bg === "transparent" ? 0 : (bg.startsWith("rgba") ? (n[3] ?? 1) : 1);
      if (alpha < 0.999) out.push(`${window.__nm(e)} background-color:${bg}`);
    }
    return out.slice(0, 8);
  }, STRUCK_SEL);
  if (noSolid.length) bad(`struck objects with no solid background-color: ${noSolid.join(", ")} — a gradient-only box has none, so a contrast probe walks past it to the page and measures the wrong surface`);
  else ok("every struck object ends in a solid background-color");

  // ── 5. overflow, and nothing rotates its own box ───────────────────────────────────
  console.log("\n══ geometry ══");
  const geo = await p.evaluate(() => {
    const doc = document.documentElement;
    const deck = document.querySelector(".hm-deck");
    const rot = [], esc = [];
    if (deck) {
      for (const e of [deck, ...deck.querySelectorAll("*")]) {
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const t = getComputedStyle(e).transform;
        const m = t && t !== "none" ? t.match(/matrix(3d)?\(([^)]+)\)/) : null;
        if (m) {
          const v = m[2].split(",").map(Number);
          // matrix(a,b,c,d,e,f) → m11,m12,m21,m22 ; matrix3d packs them at 0,1,4,5.
          // b/c are the in-plane rotation+skew terms, and they are exactly what inflates
          // the axis-aligned bounding box beyond the element's own width.
          const [a, bb, cc] = m[1] ? [v[0], v[1], v[4]] : [v[0], v[1], v[2]];
          if (Math.abs(bb) > 0.01 || Math.abs(cc) > 0.01)
            rot.push(`${window.__nm(e)} @${((Math.atan2(bb, a) * 180) / Math.PI).toFixed(1)}deg`);
        }
        if ((r.left < -1 || r.right > window.innerWidth + 1) && !window.__reachableByScrolling(e))
          esc.push(`${window.__nm(e)}[${Math.round(r.left)}..${Math.round(r.right)}]`);
      }
    }
    return { deck: Boolean(deck), overflow: doc.scrollWidth - doc.clientWidth,
      vw: window.innerWidth, rot: rot.slice(0, 6), esc: esc.slice(0, 6) };
  });
  if (geo.overflow > 0) bad(`horizontal page overflow at ${geo.vw}px = ${geo.overflow}px (the budget is 0)`);
  else ok(`0px horizontal page overflow at ${geo.vw}px`);
  if (!geo.deck) bad("the rotation + deck-overflow bound cannot run: .hm-deck matched 0 elements, and a sweep over zero elements reports no offenders — failing it instead of banking an unearned pass");
  else {
    if (geo.rot.length) bad(`deck objects rotate their own box: ${geo.rot.join(", ")} — a rotated square reports a bounding box 1.41x its width and escapes an overflow sweep even under overflow:hidden, because clipping stops the paint and not getBoundingClientRect`);
    else ok("nothing on the deck rotates its own box");
    if (geo.esc.length) bad(`deck objects past the ${geo.vw}px viewport with nothing scrollable between: ${geo.esc.join(", ")}`);
    else ok(`no deck object escapes the ${geo.vw}px viewport`);
  }

  // ── 6. touch targets ───────────────────────────────────────────────────────────────
  const touch = await p.evaluate(() => {
    const els = [...document.querySelectorAll('.hm-claim, [data-testid="chest-tile"]')];
    return { n: els.length, small: els.map((e) => {
      const r = e.getBoundingClientRect();
      return r.width < 44 || r.height < 44 ? `${window.__nm(e)} ${Math.round(r.width)}x${Math.round(r.height)}` : null;
    }).filter(Boolean).slice(0, 8) };
  });
  if (!touch.n) bad("the touch-target bound cannot run: neither .hm-claim nor [data-testid=chest-tile] is rendered, and measuring zero controls finds zero that are too small — failing it instead of banking an unearned pass");
  else if (touch.small.length) bad(`sub-44px touch targets: ${touch.small.join(", ")}`);
  else ok(`${touch.n} claim/chest touch target(s) are >= 44x44`);
  await ctx.close();

  // ── reduced motion: the shake stops, the clock does not ────────────────────────────
  console.log("\n══ prefers-reduced-motion: reduce ══");
  const { ctx: rctx, p: rp } = await boot(b, { reducedMotion: "reduce" });
  const anim = await rp.evaluate(() => {
    const tile = document.querySelector('[data-testid="chest-tile"]');
    if (!tile) return null;
    return [tile, ...tile.querySelectorAll("*")]
      .map((e) => ({ n: window.__nm(e), a: getComputedStyle(e).animationName }))
      .filter((x) => x.a && x.a !== "none")
      .map((x) => `${x.n}:${x.a}`).slice(0, 6);
  });
  if (anim === null) bad("the reduced-motion bound cannot run: [data-testid=chest-tile] is not rendered, so there is no shake to freeze — failing it instead of banking an unearned pass");
  else if (anim.length) bad(`the chest still animates under prefers-reduced-motion: ${anim.join(", ")} — every one of these must resolve to animation-name:none (both signals: the OS media query AND html[data-motion="reduce"])`);
  else ok("the chest's shake is frozen under reduced motion (animation-name: none)");

  const readBoost = () => rp.evaluate(() => document.querySelector('[data-testid="boost-timer"]')?.textContent?.trim() ?? null);
  const t0 = await readBoost();
  if (t0 === null) {
    bad('[data-testid="boost-timer"] is not rendered — the status bar must expose the live boost countdown under that testid. The mock ships boost.multiplier=2 with ~25 minutes left, so formatCountdown() renders "M:SS" and the text changes every second.');
  } else {
    // POLL for a change, do NOT sample once after a fixed wait. The invariant is "the clock
    // is not frozen", which is a question about the app; a single sample after 1.4s also
    // measures how fast the BOX is, and this one runs 23 harnesses back to back. A 1s tick
    // observed through a 1.4s window is one delayed React commit away from a false RED — it
    // produced exactly that twice, and the countdown was provably ticking both times
    // (25:00 -> 24:59 -> 24:58 sampled directly, identical under both motion settings).
    // Widening the WINDOW does not weaken the assertion: a cleared interval never changes
    // the text, so it still fails — it just no longer fails for being slow.
    let t1 = t0;
    for (let i = 0; i < 16 && t1 === t0; i++) {
      await rp.waitForTimeout(500);
      t1 = await readBoost();
    }
    if (t1 === t0) {
      bad(`the boost countdown is FROZEN under prefers-reduced-motion — still "${t0}" after 8s.`
        + " THIS IS THE ASSERTION MOST LIKELY TO BE 'FIXED' THE WRONG WAY, so read this before"
        + " changing it: reduced motion is about VESTIBULAR SAFETY, not about withholding"
        + " information, and a stopped clock lies to a student about how long their boost has"
        + " left. Freeze the pulse/glow around the numerals; NEVER clear the 1s interval that"
        + " drives them. If you silenced the shake by killing the timer, put the timer back and"
        + " gate only the animation. The mock's boost is ~25 minutes, i.e. under an hour, so the"
        + " M:SS format ticks every second — a stale string here is the app's fault, not the"
        + " fixture's.");
    } else ok(`the boost countdown keeps ticking under reduced motion ("${t0}" -> "${t1}")`);
  }
  await rctx.close();
} catch (e) {
  /* A throw here is a broken harness or a broken box, and it would otherwise exit non-zero
     with no `FAIL:` line — which reads as "the box is starved", not "the screen is wrong".
     Name it as a failure so the output is legible either way. */
  bad(`the harness itself crashed before finishing: ${e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e}`);
}

console.log(failed ? `\nHOME HUD: ${failed} FAILING ASSERTION(S)` : "\nALL HOME-HUD ASSERTIONS PASSED");
await b.close();
process.exit(failed ? 1 : 0);
