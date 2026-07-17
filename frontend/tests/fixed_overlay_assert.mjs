/* No position:fixed element may resolve its containing block to a route wrapper.
   .aurora-page-enter (RouteReveal) had `animation-fill-mode: both` over keyframes
   containing a transform; a filling transform stays a containing block for fixed
   descendants forever, so every overlay silently pinned to the page box instead of
   the viewport (rotate gate, station report, Studio popup -> commit 8df25a1).

   What counts as the bug: a FINISHED animation whose retained final keyframe leaves a
   transform behind. Two things are deliberately NOT the bug, and the check separates
   them by cause rather than by name, so it stays honest as the app grows:

   1. A still-running INFINITE animation (decorative drift: .aurora-mesh span,
      hm-flame-flicker, badge-float, aurora-readout-nudge). That is live motion.
   2. A STATIC BASE transform authored in the stylesheet (e.g. .lb-ped.p1 raises the
      gold pedestal with `transform:translateY(-12px)`). That element is a containing
      block by intent, at every moment, with or without its animation — fill-mode has
      nothing to do with it. We detect this by re-reading the computed transform with
      the animation disabled: if the transform survives, it came from base CSS.

   So we flag only: transform present WITH the animation, absent WITHOUT it. */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();

const ROUTES = ["/dashboard", "/chat", "/cases", "/flashcards", "/leaderboard"];
const ctx = await seededContext(b, base, student, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });

/* This test's premise is a SETTLED page, so wait for settlement itself rather than
   sleeping a guessed number of ms. A fixed delay raced components that mount after
   hydration/data (the flashcards coverflow): their entrance was still mid-flight, so
   the check read a legitimate in-progress transform (translateY(5.9px)) and reported a
   phantom failure.

   Scope: CSS ANIMATIONS only, which is all this test inspects. Deliberately NOT
   transitions — /dashboard keeps a CSSTransition on `.hm-fcard` permanently `running`,
   so waiting on those never returns. Infinite loops never finish by definition and are
   excluded here and in the check below. */
async function settle(p) {
  const animationsFinished = () =>
    p.waitForFunction(() => {
      const css = document.getAnimations().filter((a) => typeof a.animationName === "string");
      const finite = css.filter((a) => {
        const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
        return !t || t.iterations !== Infinity;
      });
      return finite.every((a) => a.playState === "finished" || a.playState === "idle");
    }, null, { timeout: 15000 });
  await animationsFinished();
  await p.waitForTimeout(250); // let any late-mounting entrance start...
  await animationsFinished();  // ...and then finish too
}

for (const route of ROUTES) {
  const p = await ctx.newPage();
  await p.goto(base + route, { waitUntil: "domcontentloaded" });
  await settle(p);

  const bad = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.animationName === "none") continue;
      if (cs.animationIterationCount.split(",").some((c) => c.trim() === "infinite")) continue;
      const filled = String(cs.transform);
      if (filled === "none") continue;

      // Snapshot BEFORE mutating: getComputedStyle is live, and restoring the inline
      // animation restarts it, which would otherwise poison a later read.
      const fill = String(cs.animationFillMode);
      const name = String(cs.animationName);
      const prevInline = el.style.animation;
      el.style.animation = "none";
      const bare = String(getComputedStyle(el).transform);
      el.style.animation = prevInline;

      // Transform survives without the animation => authored base CSS, not a fill artifact.
      if (bare !== "none") continue;

      out.push({ cls: (el.className || "").toString().slice(0, 40), transform: filled, fill, name });
    }
    return out;
  });
  if (bad.length) {
    die(`${route}: settled animation(s) retain a transform, which traps position:fixed:\n` +
        bad.map((x) => `   .${x.cls} anim=${x.name} transform=${x.transform} fill-mode=${x.fill} (base transform: none)`).join("\n") +
        `\n   Fix: if the 100% keyframe equals the element's natural value for EVERY animated\n` +
        `   property (opacity included), change fill-mode to \`backwards\`. If it does not\n` +
        `   (e.g. an opacity:0 base like .flash-option), \`both\` is load-bearing — leave it\n` +
        `   and portal the fixed descendant out instead.`);
  }
  ok(`${route}: no settled animation leaves a containing-block transform`);
  await p.close();
}

console.log("ALL FIXED-OVERLAY ASSERTIONS PASSED");
await b.close();
