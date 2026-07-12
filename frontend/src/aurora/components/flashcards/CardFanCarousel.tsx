"use client";
/* CardFanCarousel — the topic picker: a 3D CIRCULAR RING of large topic cards that spins
   CONTINUOUSLY around the vertical axis. Cards are pinned at fixed angles on a ring
   (rotateY(θ) translateZ(radius)); a single rAF loop advances one `rotation` value and
   writes it to the ring container (.fan-layout) each frame, so the whole scene turns as a
   group. Per card we only update opacity (front card solid, back cards fade out) + z-index
   — cheaper than the old per-card coverflow transforms. Drag/flick spins it, arrows nudge
   by one topic (snap so a card faces front), and it idles with a slow drift. A TAP opens
   the FRONT-FACING topic whose live on-screen centre is nearest the tap — resolved at the
   STAGE (cards are pointer-events:none) so the drift + 3D projection can't swallow the
   click the way a per-card <button> click did. Keyboard Enter still picks via the button.
   Reactive to reduced motion (freezes parked with the first card — Mixed — facing front).
   The component API (cards / onPick / autoAdvanceMs) and every test hook (flash-fan,
   flash-pick, data-card-id, flash-prev/next) are unchanged. No race numbers, no dots. */
import { useState, useEffect, useRef, useCallback } from "react";

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

const FRONT_ARC = 85; // |angle-from-front| below which a card is a pickable, front-facing target

function getCardWidth(width: number) {
  if (width < 400) return 220;
  if (width < 560) return 244;
  if (width < 768) return 268;
  if (width < 1024) return 288;
  return 300;
}

// Ring radius (px a card is pushed out from centre). Larger ⇒ wider fan + a bigger front
// card under the stage's fixed perspective(2500). Capped so the enlarged front card still
// fits the shortest stage (its caption must stay visible, not crop), scaling down on
// small viewports where both the stage and the base card shrink too.
function getRadius(width: number) {
  if (width < 400) return 170;
  if (width < 560) return 200;
  if (width < 768) return 230;
  if (width < 1024) return 255;
  return 270;
}

function isReduced() {
  return (typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-motion") === "reduce") ||
    (typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// Signed on-screen angle of a card sitting at base angle `base` when the ring is rotated by
// `rot`, normalised to (-180, 180] — 0 = dead centre / facing the viewer.
function frontAngle(base: number, rot: number) {
  let a = (base + rot) % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

const chevron = (direction: "left" | "right") => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points={direction === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </svg>
);

export function CardFanCarousel({ cards, onPick, autoAdvanceMs = 2600 }: CardFanCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef(0);            // live ring rotation (deg); 0 parks card 0 at front
  const targetRef = useRef(0);         // eased target when nudging / after a flick
  const velRef = useRef(0);            // instantaneous drag velocity (px/ms) → flick momentum
  const draggingRef = useRef(false);
  const paintRef = useRef<() => void>(() => {});
  const total = cards.length;
  const step = total ? 360 / total : 360; // degrees between adjacent topics on the ring
  const [reduced, setReduced] = useState(false);

  // Arrows nudge the ring by one topic; snap the current target to the grid first so a
  // card always ends up facing front.
  const nudge = useCallback((dir: 1 | -1) => {
    targetRef.current = Math.round(targetRef.current / step) * step + dir * step;
    if (isReduced()) { rotRef.current = targetRef.current; }
    paintRef.current();
  }, [step]);

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

  // The ring. Card transforms (angle + push-out) are static — set on mount/resize — so the
  // per-frame loop only rotates the container and fades cards by how far they face away.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !total) return;
    const els = Array.from(container.querySelectorAll<HTMLElement>(".fan-card"));
    const angles = els.map((_, i) => i * step);
    const zCache = new Array(els.length).fill(NaN);
    let radius = getRadius(window.innerWidth);

    // Pin each card at its fixed seat on the ring (facing outward, so the front one faces us).
    const place = () => {
      radius = getRadius(window.innerWidth);
      for (let i = 0; i < els.length; i++) {
        els[i].style.transform = `rotateY(${angles[i]}deg) translateZ(${radius}px)`;
      }
    };

    const paint = () => {
      const rot = rotRef.current;
      container.style.transform = `rotateY(${rot.toFixed(2)}deg)`;
      for (let i = 0; i < els.length; i++) {
        const a = Math.abs(frontAngle(angles[i], rot));
        // Solid through the front arc, fading to nothing by the time a card faces away.
        const opacity = Math.max(0, Math.min(1, 1.18 - a / 95));
        els[i].style.opacity = opacity.toFixed(3);
        const zi = 200 + Math.round(Math.cos((a * Math.PI) / 180) * 100);
        if (zCache[i] !== zi) { els[i].style.zIndex = String(zi); zCache[i] = zi; }
      }
    };
    paintRef.current = paint;
    place();
    paint(); // seat + light the cards before first frame (no stacked-card flash)

    const onResize = () => { place(); paint(); };
    window.addEventListener("resize", onResize);

    let raf = 0;
    if (!reduced) {
      const drift = autoAdvanceMs > 0 ? step / autoAdvanceMs : 0; // deg per ms (idle roll)
      let last = performance.now();
      const tick = (now: number) => {
        const dt = now - last; last = now;
        if (!draggingRef.current) {
          const d = targetRef.current - rotRef.current;
          if (Math.abs(d) > 0.01) {
            rotRef.current += d * 0.12;              // ease toward a nudged/flicked target
          } else {
            rotRef.current += dt * drift;            // idle drift around the ring
            targetRef.current = rotRef.current;
          }
        }
        paint();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [total, step, reduced, autoAdvanceMs]);

  // Drag / flick the ring; a TAP (little travel, quick) is resolved to a topic pick at the
  // STAGE, not per-card. The ring auto-rolls and each card is a moving, 3D-projected target,
  // so relying on the card <button>'s own click let taps fall through to .fan-layout and do
  // nothing (the exact failure the home FeatureCarousel fixed). Cards are pointer-events:
  // none, so every gesture lands here; on a tap we open the FRONT-FACING card whose live
  // on-screen centre is nearest the pointer. Works in both motion modes; keyboard Enter
  // still picks via the button's onClick.
  const TAP_SLOP = 8; // px of travel below which a pointer-up counts as a tap, not a drag
  const drag = useRef({ down: false, startX: 0, startRot: 0, lastX: 0, lastT: 0, startT: 0, moved: false });
  const onPointerDown = (e: React.PointerEvent) => {
    const d = drag.current;
    d.down = true; d.moved = false; d.startX = e.clientX; d.startRot = rotRef.current;
    d.lastX = e.clientX; d.lastT = performance.now(); d.startT = d.lastT;
    draggingRef.current = true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.down) return;
    // Dragging one card-width spins the ring by roughly one topic.
    const degPerPx = step / getCardWidth(window.innerWidth);
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > TAP_SLOP) d.moved = true;
    rotRef.current = d.startRot - dx * degPerPx;
    const now = performance.now();
    if (now - d.lastT > 0) velRef.current = (e.clientX - d.lastX) / (now - d.lastT);
    d.lastX = e.clientX; d.lastT = now;
    if (reduced) paintRef.current();   // no rAF under reduced motion — reflect the drag
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d.down) return;
    d.down = false; draggingRef.current = false;
    const degPerPx = step / getCardWidth(window.innerWidth);
    const flick = -velRef.current * 150 * degPerPx;               // momentum → snap to a card
    targetRef.current = Math.round((rotRef.current + flick) / step) * step;
    if (reduced) { rotRef.current = targetRef.current; paintRef.current(); }
    velRef.current = 0;
  };
  // Open the FRONT-FACING topic whose live on-screen centre is nearest the tap X —
  // independent of the drift/projection, and ignoring cards on the far side of the ring
  // (which project to the same centre X but face away).
  const resolvePick = (clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rot = rotRef.current;
    let bestI = -1, bestDx = Infinity;
    const els = container.querySelectorAll<HTMLElement>(".fan-card");
    for (let i = 0; i < els.length; i++) {
      if (Math.abs(frontAngle(i * step, rot)) > FRONT_ARC) continue; // skip the back half
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
        {/* .fan-layout stays a FLAT, full-stage pointer catcher (its hit-plane never tilts),
            so a tap anywhere — including on a banked side card — always lands here and is
            resolved against live card rects. The inner .fan-ring is what actually rotates. */}
        <div className="fan-layout" data-testid="flash-fan"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={endDrag} onPointerLeave={endDrag}>
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
                <span className="fan-card-gloss" aria-hidden />
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
