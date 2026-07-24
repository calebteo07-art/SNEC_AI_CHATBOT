/* hoverPause — the hot zone that freezes a drifting coverflow under the cursor.
   Shared by the home FeatureCarousel and the flashcards CardFanCarousel: hovering the
   FRONT CARD pauses the idle drift so you can read (and click) it; the side cards, the
   arrows and the rest of the stage keep it flowing (user, 2026-07-24: pause on hover,
   but only over a small region).

   It has to be geometry, not CSS :hover — in both carousels the cards are
   pointer-events:none and every gesture is resolved at the stage against live rects, so
   a real hover target would swallow the taps those stages exist to catch.

   Pass the card's LAID-OUT size (offsetWidth/offsetHeight), not getBoundingClientRect():
   the cards carry a live 3D transform, so their client rect is the drifting, scaled
   PROJECTION and the zone would breathe with the animation. Measuring also tracks the CSS
   size tiers for free — the same reason both carousels measure their card for spacing. */

export interface StageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** True when (x, y) — viewport coords — is over the front card: a cardW × cardH box
 *  centred on the stage. Edges count as inside. An unmeasured card (0 size, before
 *  layout) has no zone, so it can never freeze the ring. */
export function inFrontCardZone(
  stage: StageBox,
  cardW: number,
  cardH: number,
  x: number,
  y: number,
): boolean {
  if (cardW <= 0 || cardH <= 0) return false;
  const cx = stage.left + stage.width / 2;
  const cy = stage.top + stage.height / 2;
  return Math.abs(x - cx) <= cardW / 2 && Math.abs(y - cy) <= cardH / 2;
}
