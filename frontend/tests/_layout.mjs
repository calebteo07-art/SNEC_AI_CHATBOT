/* Shared layout reachability probe.
 *
 * Both overflow checks in this directory measured getBoundingClientRect() against the
 * viewport and called anything past the edge a defect. That is wrong for a horizontal
 * SCROLLER: the home badge shelf (`.hm-badges`, overflow-x:auto, five slots spanning the
 * frame and twenty badges in it) puts badge six past the right edge on purpose, and you
 * reach it by scrolling. It was reported as broken at every viewport INCLUDING 1440x900
 * desktop, which is the tell — no genuine mobile overflow reproduces on a desktop.
 *
 * The distinction that matters to a user is REACHABILITY, not geometry:
 *   - inside an overflow-x:auto|scroll ancestor that itself fits  -> scroll to it, fine;
 *   - clipped by an overflow-x:hidden ancestor                    -> gone, a real defect;
 *   - past the viewport with nothing scrollable between           -> a real defect.
 * `.aurora-main-scroll` sets overflow-x:hidden, which is exactly why the harnesses must
 * not simply trust document.scrollWidth — and why stopping the walk at `hidden` is
 * load-bearing rather than a shortcut.
 *
 * Installed per browser context so it is available inside page.evaluate. Kept out of
 * seededContext() on purpose: only the two overflow harnesses need it, and a global that
 * appears on every page in the suite is the kind of thing that silently grows meaning.
 */
export function installReachability(ctx) {
  return ctx.addInitScript(() => {
    /** Is this element past the viewport only because it lives in a scroller? */
    window.__reachableByScrolling = (el) => {
      const vw = window.innerWidth;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === "auto" || ox === "scroll") {
          // Only if the scroller ITSELF fits. A scroll container that is itself wider
          // than the viewport is a real defect, and its contents inherit that.
          const r = n.getBoundingClientRect();
          return r.left >= -1 && r.right <= vw + 1;
        }
        // Clipped before any scroller was reached — nothing can bring it on screen.
        if (ox === "hidden") return false;
      }
      return false;
    };
  });
}
