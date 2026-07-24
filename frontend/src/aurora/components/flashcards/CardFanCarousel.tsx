"use client";
/* CardFanCarousel — the topic picker: a 3D COVERFLOW of large topic cards that drifts
   CONTINUOUSLY. ONE front card is pushed FORWARD (bigger, upright, on top) and its neighbours
   recede BACKWARD and bank steeply away, so the front card is unmistakably the focus. Every
   VISIBLE card is fully opaque (100%) — depth + bank alone rank them, no dimming (user, 2026-07-13).
   Only a WINDOW of cards (the front ± two) is drawn; the rest park at opacity 0. That
   windowing + real depth (front +z, sides −z) is what keeps the picker looking the SAME whether
   a role has 9 topics or the real 26 (OA/PSA) / 31 (OT): the earlier flat RING pushed every
   card to nearly the same depth, so under a weak perspective 5–7 same-size cards crushed into an
   unreadable slab. A single rAF loop advances a fractional `flow` (front-card index); each frame
   we write every visible card's coverflow transform (translateX/Z + rotateY) + opacity as a
   smooth function of its signed distance from the front, so fractional drift never pops. Drag/
   flick spins it, arrows nudge by one topic (snap so a card faces front), idle auto-drift. A TAP
   opens the FRONT-FACING windowed topic whose live on-screen centre is nearest the tap — resolved
   at the STAGE (cards are pointer-events:none) so the drift + 3D projection can't swallow the
   click. Keyboard Enter still picks via the button. Reduced motion freezes it, parked with the
   first card (Mixed) facing front. The component API (cards / onPick / autoAdvanceMs) and every
   test hook (flash-fan, flash-pick, data-card-id, flash-prev/next) are unchanged. No numbers/dots. */
import { useState, useEffect, useRef, useCallback } from "react";
import { inFrontCardZone } from "@/aurora/lib/hoverPause";

export interface FanCard {
  id: string;
  imgUrl: string;
  label: string;
  sub?: string;
  hue: number;
  startable?: boolean;
}

interface CardFanCarouselProps {
  cards: FanCard[];
  onPick: (card: FanCard) => void;
  /** Milliseconds the ring takes to drift past one topic (the continuous pace). */
  autoAdvanceMs?: number;
}

const WINDOW = 3;   // how many topics either side of the front are drawn; the rest park (opacity 0)
const TILT = 54;    // degrees a fully-banked side card is rotated away from the viewer

/* The card width the spacing maths must use is whatever CSS ACTUALLY laid out — measure it,
   never re-derive it. This used to guess from `window.innerWidth` with breakpoints at
   400/560/768/1024 while aurora.css switched size at a single 639px, so the two disagreed
   across 640-1023px: CSS drew a 348px card while the maths placed neighbours for a 326px
   one. Because the locked depth projection is *proportional* to W (k = W/300 below), a wrong
   W silently mis-scales the whole coverflow — the exact failure the lock exists to prevent.
   Measuring means a CSS size change can never desync it again. The literals survive only as
   a pre-layout fallback for the first paint. */
function fallbackCardWidth(width: number) {
  if (width < 400) return 252;
  if (width < 560) return 278;
  if (width < 768) return 302;
  if (width < 1024) return 326;
  return 348;
}

function measureCardWidth(container: HTMLElement | null) {
  const card = container?.querySelector<HTMLElement>(".fan-card");
  const w = card?.offsetWidth ?? 0;
  return w > 0 ? w : fallbackCardWidth(typeof window === "undefined" ? 1440 : window.innerWidth);
}

// Coverflow spacing, derived from the card width so it scales proportionally on mobile.
// gap1 = how far the FIRST neighbour sits off-centre (leaves the front card room); stepX = each
// further step; frontZ pushes the centre card toward the viewer and backZ/stepZ push neighbours
// away — that real depth (not just rotation) is what makes the front card clearly the biggest
// under the stage's perspective, so many topics never crush into a same-size slab.
function coverMetrics(container: HTMLElement | null) {
  const W = measureCardWidth(container);
  const k = W / 300;
  return { gap1: W * 0.64, stepX: W * 0.44, frontZ: 70 * k, backZ: 150 * k, stepZ: 95 * k };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
// smoothstep: 0 at the front, easing to a flat 1 by one step out — gives the first neighbour its
// full bank/offset while keeping fractional drift between cards perfectly smooth (no pop).
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

function isReduced() {
  return (typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-motion") === "reduce") ||
    (typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

const chevron = (direction: "left" | "right") => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points={direction === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </svg>
);

export function CardFanCarousel({ cards, onPick, autoAdvanceMs = 2600 }: CardFanCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef(0);           // fractional front-card index; 0 parks card 0 (Mixed) front
  const targetRef = useRef(0);         // eased target when nudging / after a flick
  const velRef = useRef(0);            // instantaneous drag velocity → flick momentum
  const draggingRef = useRef(false);
  const hoverRef = useRef(false);      // cursor over the FRONT card → hold the idle drift
  const paintRef = useRef<() => void>(() => {});
  const total = cards.length;
  const [reduced, setReduced] = useState(false);

  // Signed distance (in card-index units) of card `i` from the current front, wrapped to the
  // shortest way round the ring: (-total/2, total/2].
  const relOf = useCallback((i: number, flow: number) => {
    let rel = ((i - flow) % total + total) % total;
    if (rel > total / 2) rel -= total;
    return rel;
  }, [total]);

  // Arrows nudge the ring by one topic; snap the target to a whole index so a card faces front.
  const nudge = useCallback((dir: 1 | -1) => {
    targetRef.current = Math.round(targetRef.current) + dir;
    if (isReduced()) { flowRef.current = targetRef.current; }
    paintRef.current();
  }, []);

  // Track reduced motion, including live changes — the harness toggles it, and the profile
  // toggle flips html[data-motion]. Freezing lets an automated click land on a stable card.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(isReduced());
    apply();
    mq.addEventListener("change", apply);
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => { mq.removeEventListener("change", apply); obs.disconnect(); };
  }, []);

  // The coverflow. Each frame we place the windowed cards by their signed distance from the
  // front: the centre card forward + upright, neighbours pushed back and banked away, fading
  // out toward the window edge; cards outside the window are hidden (opacity 0) so a role with
  // 26+ topics still shows one dominant, readable front card instead of an overlapping slab.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !total) return;
    const els = Array.from(container.querySelectorAll<HTMLElement>(".fan-card"));
    const zCache = new Array(els.length).fill(NaN);
    let m = coverMetrics(container);

    const paint = () => {
      const flow = flowRef.current;
      for (let i = 0; i < els.length; i++) {
        const rel = relOf(i, flow);
        const a = Math.abs(rel);
        if (a > WINDOW) {                             // parked outside the front window
          if (els[i].style.opacity !== "0") els[i].style.opacity = "0";
          continue;
        }
        const s = rel < 0 ? -1 : 1;
        const e = smooth(a);                          // 0 at the front → 1 by one step out
        const over = a > 1 ? a - 1 : 0;               // extra steps past the first neighbour
        const x = s * (m.gap1 * e + m.stepX * over);  // slide out to the side
        const z = m.frontZ * (1 - e) - m.backZ * e - m.stepZ * over; // forward at front, back at sides
        const rot = -s * TILT * e;                    // upright at front, banked away at the sides
        els[i].style.transform =
          `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${rot.toFixed(2)}deg)`;
        // FULLY OPAQUE through the front card and its two visible neighbours (user, 2026-07-13:
        // topic cards at 100% opacity — depth/bank alone signals the front card, no dimming); the
        // opacity fades only across the FINAL window step (a = WINDOW-1 → WINDOW) so a card
        // entering/leaving the window still eases 1→0 instead of popping. Windowing (parked cards at
        // opacity 0) is untouched — it's what keeps 26+ topics from crushing into a slab.
        els[i].style.opacity = clamp01(WINDOW - a).toFixed(3);
        const zi = 1000 + Math.round(z);              // deeper card ⇒ lower stacking order
        if (zCache[i] !== zi) { els[i].style.zIndex = String(zi); zCache[i] = zi; }
      }
    };
    paintRef.current = paint;
    paint(); // place cards before first frame (no stacked-card flash)

    // Re-measure on resize: a rotate crosses the CSS size tier, so the card's laid-out
    // width changes and the projection must follow it or the spacing is left scaled for
    // the previous orientation.
    const onResize = () => { m = coverMetrics(container); paint(); };
    window.addEventListener("resize", onResize);

    let raf = 0;
    if (!reduced) {
      const speed = autoAdvanceMs > 0 ? 1 / autoAdvanceMs : 0; // topics per ms (idle drift)
      let last = performance.now();
      const tick = (now: number) => {
        const dt = now - last; last = now;
        if (!draggingRef.current) {
          const d = targetRef.current - flowRef.current;
          if (Math.abs(d) > 0.001) {
            flowRef.current += d * 0.12;              // ease toward a nudged/flicked target
          } else if (!hoverRef.current) {
            flowRef.current += dt * speed;            // idle drift around the ring
            targetRef.current = flowRef.current;
          }
          // Hovering the FRONT card holds the idle drift (the branch above) so you can read
          // and pick it; an arrow nudge or a flick already in flight still eases home first.
        }
        paint();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [total, reduced, autoAdvanceMs, relOf]);

  // Drag / flick the coverflow; a TAP (little travel, quick) is resolved to a topic pick at the
  // STAGE, not per-card. The coverflow auto-rolls and each card is a moving, 3D-projected target,
  // so relying on the card <button>'s own click let taps fall through to .fan-layout and do
  // nothing (the exact failure the home FeatureCarousel fixed). Cards are pointer-events:none,
  // so every gesture lands here; on a tap we open the windowed, front-facing card whose live
  // on-screen centre is nearest the pointer. Keyboard Enter still picks via the button onClick.
  const TAP_SLOP = 8; // px of travel below which a pointer-up counts as a tap, not a drag
  const drag = useRef({ down: false, startX: 0, startY: 0, startFlow: 0, lastX: 0, lastT: 0, startT: 0, moved: false });
  const onPointerDown = (e: React.PointerEvent) => {
    const d = drag.current;
    d.down = true; d.moved = false; d.startX = e.clientX; d.startY = e.clientY; d.startFlow = flowRef.current;
    d.lastX = e.clientX; d.lastT = performance.now(); d.startT = d.lastT;
    draggingRef.current = true;
  };
  // Hover-pause is resolved here at the stage for the same reason picks are: the cards are
  // pointer-events:none, so a CSS :hover target would swallow the taps. The zone is the FRONT
  // CARD only — a box its laid-out size, centred on the stage — so the banked neighbours and
  // the arrows keep the ring drifting. Mouse only: touch has no hover, and a finger drag must
  // never leave the ring frozen.
  const updateHover = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const card = containerRef.current?.querySelector<HTMLElement>(".fan-card");
    hoverRef.current = !!card && inFrontCardZone(
      e.currentTarget.getBoundingClientRect(), card.offsetWidth, card.offsetHeight, e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    updateHover(e);
    const d = drag.current;
    if (!d.down) return;
    const cw = measureCardWidth(containerRef.current);
    const dx = e.clientX - d.startX;
    // Measure travel on BOTH axes. Horizontal-only slop means a vertical scroll flick is
    // still a "tap", so on a touch device a flick to scroll the page opens a deck instead
    // (the same defect the home carousel shipped — see FeatureCarousel, commit ee41cf3).
    // Latent while this picker is dvh-sized and unscrollable; one layout change from real.
    if (Math.abs(dx) > TAP_SLOP || Math.abs(e.clientY - d.startY) > TAP_SLOP) d.moved = true;
    flowRef.current = d.startFlow - dx / (cw * 0.62); // dragging one card-width ≈ one topic
    const now = performance.now();
    if (now - d.lastT > 0) velRef.current = (e.clientX - d.lastX) / (now - d.lastT);
    d.lastX = e.clientX; d.lastT = now;
    if (reduced) paintRef.current();   // no rAF under reduced motion — reflect the drag
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d.down) return;
    d.down = false; draggingRef.current = false;
    const cw = measureCardWidth(containerRef.current);
    const flick = -velRef.current * 150 / (cw * 0.62);           // momentum → snap to a card
    targetRef.current = Math.round(flowRef.current + flick);
    if (reduced) { flowRef.current = targetRef.current; paintRef.current(); }
    velRef.current = 0;
  };
  // Cursor off the stage: no hover, and any drag that wandered out settles.
  const leaveStage = () => { hoverRef.current = false; endDrag(); };
  // Open the windowed, FRONT-FACING topic whose live on-screen centre is nearest the tap X —
  // independent of the drift/projection, and ignoring parked cards (outside the window), which
  // can project near the same centre X but are hidden.
  const resolvePick = (clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const flow = flowRef.current;
    let bestI = -1, bestDx = Infinity;
    const els = container.querySelectorAll<HTMLElement>(".fan-card");
    for (let i = 0; i < els.length; i++) {
      if (Math.abs(relOf(i, flow)) > WINDOW) continue; // skip parked cards
      const r = els[i].getBoundingClientRect();
      const dx = Math.abs(r.left + r.width / 2 - clientX);
      if (dx < bestDx) { bestDx = dx; bestI = i; }
    }
    const card = bestI >= 0 ? cards[bestI] : undefined;
    if (card && card.startable !== false) onPick(card);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    const wasTap = d.down && !d.moved && performance.now() - d.startT < 700;
    const x = e.clientX;
    endDrag();
    if (wasTap) resolvePick(x);
  };

  if (!total) return null;

  return (
    <section className="fan-section" aria-label="Topics">
      {/* Arrows flank the ring: absolutely pinned to the left/right edges of the stage and
          vertically centred, floating just outside the front card. */}
      <button type="button" className="fan-arrow fan-arrow-prev flash-press" data-testid="flash-prev"
        onClick={() => nudge(-1)} aria-label="Previous">{chevron("left")}</button>
      <button type="button" className="fan-arrow fan-arrow-next flash-press" data-testid="flash-next"
        onClick={() => nudge(1)} aria-label="Next">{chevron("right")}</button>
      <div className="fan-stage">
        {/* .fan-layout stays a FLAT, full-stage pointer catcher (it never transforms, so its
            hit-plane always fills the stage); every tap lands here and is resolved against live
            card rects. .fan-ring is the 3D context the windowed cards are placed into. */}
        <div className="fan-layout" data-testid="flash-fan"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={endDrag} onPointerLeave={leaveStage}>
          <div ref={containerRef} className="fan-ring">
          {cards.map((card, i) => (
            <button key={card.id} type="button"
              className={`fan-card${card.startable === false ? " is-locked" : ""}`}
              data-testid="flash-pick" data-card-id={card.id}
              disabled={card.startable === false}
              aria-label={`${card.label}${card.sub ? ", " + card.sub : ""}`}
              // Cards are pointer-events:none, so this fires only for keyboard (Enter/Space)
              // on a focused card; mouse/touch taps are resolved at the stage (onPointerUp).
              onClick={() => { if (card.startable !== false) onPick(card); }}>
              <span className="fan-card-media" style={{ "--fan-hue": card.hue } as React.CSSProperties}>
                <img src={card.imgUrl} alt="" loading="eager" decoding="async"
                  fetchPriority={i === 0 ? "high" : "low"}
                  onError={(e) => { e.currentTarget.closest(".fan-card")?.classList.add("is-placeholder"); }} />
              </span>
              <span className="fan-card-cap">
                <span className="fan-card-label">{card.label}</span>
                {card.sub && <span className="fan-card-sub">{card.sub}</span>}
              </span>
            </button>
          ))}
          </div>
        </div>
      </div>
    </section>
  );
}
