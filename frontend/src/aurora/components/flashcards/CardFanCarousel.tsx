"use client";
/* CardFanCarousel — the GRAND PRIX starting grid. A 3D COVERFLOW of topic "racer"
   cards that flows CONTINUOUSLY like a race down the straight: a single rAF loop
   advances a fractional "flow" offset and writes each card's coverflow transform
   every frame (centre card largest + facing forward, side cards banked away into
   depth). The field's velocity leans the camera in (perspective narrows → speed) and
   streaks the speed-lines. Drag/flick to spin the grid, arrows nudge by one. A TAP
   opens the topic whose live on-screen centre is nearest the tap — resolved at the
   STAGE (cards are pointer-events:none), so the continuous drift + 3D projection can't
   swallow the click the way a per-card <button> click did (same failure the home
   FeatureCarousel fixed). Keyboard Enter still picks via the button. Reactive to reduced
   motion (freezes to a static parked grid). The component API (cards / onPick /
   autoAdvanceMs) and every test hook (flash-fan, flash-pick, data-card-id,
   flash-prev/next, fan-dot) are unchanged. */
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
  /** Milliseconds the grid takes to roll one card-width (the continuous pace). */
  autoAdvanceMs?: number;
}

const SPAN = 3.4; // visible half-width in slot units past which a card is parked off-screen

function getCardWidth(width: number) {
  if (width < 400) return 150;
  if (width < 560) return 168;
  if (width < 768) return 190;
  if (width < 1024) return 210;
  return 232;
}

function isReduced() {
  return (typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-motion") === "reduce") ||
    (typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// Coverflow transform for a signed slot offset `rel` (0 = centre). `sv` is the smoothed
// field velocity (0..1) — it deepens the bank and pushes side cards further back so the
// grid "opens up" as it moves. STEP > half a card guarantees each neighbour's centre
// clears the centre card, so every card stays clickable (harness picks by data-card-id).
function coverAt(rel: number, cw: number, sv: number, reduced: boolean) {
  const a = Math.abs(rel);
  const step = cw * (0.60 + sv * 0.06);
  const x = rel * step;
  const rot = reduced ? Math.max(-16, Math.min(16, -rel * 11))
    : Math.max(-52, Math.min(52, -rel * (28 + sv * 8)));
  const z = reduced ? 0 : -Math.min(a, 3) * cw * (0.5 + sv * 0.18) - (a > 0.05 ? cw * 0.16 : 0);
  const scale = Math.max(0.58, 1 - a * (reduced ? 0.12 : 0.19));
  const opacity = a > SPAN ? 0 : Math.max(reduced ? 0.5 : 0.24, 1 - a * (reduced ? 0.12 : 0.3));
  return { x, y: 0, z, rot, scale, opacity, zIndex: Math.round(100 - a * 10) };
}

const chevron = (direction: "left" | "right") => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points={direction === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </svg>
);

export function CardFanCarousel({ cards, onPick, autoAdvanceMs = 2600 }: CardFanCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef(0);           // fractional grid position (centre card index)
  const targetRef = useRef(0);         // eased target when nudging / after a flick
  const velRef = useRef(0);            // instantaneous drag velocity (cards/frame-ish)
  const svRef = useRef(0);             // smoothed field velocity 0..1 → FOV + streaks
  const draggingRef = useRef(false);
  const paintRef = useRef<() => void>(() => {});
  const activeDotRef = useRef(-1);
  const total = cards.length;
  const [reduced, setReduced] = useState(false);

  // Arrows nudge the grid to the next integer position.
  const nudge = useCallback((dir: 1 | -1) => {
    targetRef.current = Math.round(targetRef.current) + dir; paintRef.current();
  }, []);

  // Track reduced motion, including live changes — the harness toggles it, and the
  // profile toggle flips html[data-motion]. Freezing lets an automated click land on a
  // stable card.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(isReduced());
    apply();
    mq.addEventListener("change", apply);
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => { mq.removeEventListener("change", apply); obs.disconnect(); };
  }, []);

  // The grid. Per-frame work stays minimal (read card nodes + width once, write only a
  // GPU transform + opacity each frame). Static under reduced motion.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !total) return;
    const els = Array.from(container.querySelectorAll<HTMLElement>(".fan-card"));
    const dots = Array.from(container.parentElement?.querySelectorAll<HTMLElement>(".fan-dot") ?? []);
    const zCache = new Array(els.length).fill(NaN);
    let cw = getCardWidth(window.innerWidth);
    const viewport = container.parentElement; // .fan-stage (owns perspective + --vel)

    const paint = () => {
      const flow = flowRef.current;
      const sv = reduced ? 0 : svRef.current;
      for (let i = 0; i < els.length; i++) {
        let rel = ((i - flow) % total + total) % total;
        if (rel > total / 2) rel -= total;           // centre the wrap: -N/2..N/2
        const t = coverAt(rel, cw, sv, reduced);
        const bob = (!reduced && Math.abs(rel) < 0.25) ? Math.sin(performance.now() / 520) * 5 : 0;
        els[i].style.transform =
          `translate3d(${t.x.toFixed(1)}px, ${bob.toFixed(1)}px, ${t.z.toFixed(1)}px) rotateY(${t.rot.toFixed(2)}deg) scale(${t.scale.toFixed(3)})`;
        els[i].style.opacity = t.opacity.toFixed(3);
        if (zCache[i] !== t.zIndex) { els[i].style.zIndex = String(t.zIndex); zCache[i] = t.zIndex; }
      }
      if (viewport) {
        viewport.style.setProperty("--vel", sv.toFixed(3));
        viewport.style.perspective = `${(1350 - sv * 470).toFixed(0)}px`;
      }
      const active = ((Math.round(flow) % total) + total) % total;
      if (active !== activeDotRef.current) {
        if (activeDotRef.current >= 0 && dots[activeDotRef.current]) dots[activeDotRef.current].classList.remove("is-on");
        if (dots[active]) dots[active].classList.add("is-on");
        activeDotRef.current = active;
      }
    };
    paintRef.current = paint;
    paint(); // place cards before first paint (no stacked-card flash)

    const onResize = () => { cw = getCardWidth(window.innerWidth); paint(); };
    window.addEventListener("resize", onResize);

    let raf = 0;
    if (!reduced) {
      const speed = autoAdvanceMs > 0 ? 1 / autoAdvanceMs : 0; // cards per ms (auto-roll)
      let last = performance.now();
      const tick = (now: number) => {
        const dt = now - last; last = now;
        if (draggingRef.current) {
          // hand on the wheel — position follows the pointer (set in onMove)
          svRef.current += (Math.min(1, Math.abs(velRef.current) * 22) - svRef.current) * 0.2;
        } else {
          const d = targetRef.current - flowRef.current;
          if (Math.abs(d) > 0.001) {
            flowRef.current += d * 0.12;                 // ease toward a nudged target
            svRef.current += (Math.min(1, Math.abs(d) * 1.6) - svRef.current) * 0.15;
          } else {
            flowRef.current += dt * speed;               // idle auto-roll down the straight
            targetRef.current = flowRef.current;
            svRef.current += (0.12 - svRef.current) * 0.05;
          }
        }
        paint();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [total, reduced, autoAdvanceMs]);

  // Drag / flick the grid; a TAP (little travel, quick) is resolved to a topic pick at
  // the STAGE, not per-card. The coverflow auto-rolls and each card is a moving, 3D-
  // projected target, so relying on the card <button>'s own click let taps fall through
  // to .fan-layout and do nothing (the exact failure the home FeatureCarousel fixed).
  // Cards are pointer-events:none, so every gesture lands here; on a tap we open the card
  // whose live on-screen centre is nearest the pointer. Works in both motion modes;
  // keyboard Enter still picks via the button's onClick.
  const TAP_SLOP = 8; // px of travel below which a pointer-up counts as a tap, not a drag
  const drag = useRef({ down: false, startX: 0, startFlow: 0, lastX: 0, lastT: 0, startT: 0, moved: false });
  const onPointerDown = (e: React.PointerEvent) => {
    const d = drag.current;
    d.down = true; d.moved = false; d.startX = e.clientX; d.startFlow = flowRef.current;
    d.lastX = e.clientX; d.lastT = performance.now(); d.startT = d.lastT;
    draggingRef.current = true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.down) return;
    const cw = getCardWidth(window.innerWidth);
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > TAP_SLOP) d.moved = true;
    flowRef.current = d.startFlow - dx / (cw * 0.62);
    const now = performance.now();
    if (now - d.lastT > 0) velRef.current = (e.clientX - d.lastX) / (now - d.lastT);
    d.lastX = e.clientX; d.lastT = now;
    if (reduced) paintRef.current();   // no rAF under reduced motion — reflect the drag
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d.down) return;
    d.down = false; draggingRef.current = false;
    const cw = getCardWidth(window.innerWidth);
    const flick = -velRef.current * 150 / (cw * 0.62);   // momentum → snap to a card
    targetRef.current = Math.round(flowRef.current + flick);
    velRef.current = 0;
  };
  // Open the topic whose live on-screen centre is nearest the tap X — independent of the
  // drift and 3D projection that made a per-card click unreliable.
  const resolvePick = (clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    let best: HTMLElement | null = null, bestDx = Infinity;
    for (const el of container.querySelectorAll<HTMLElement>(".fan-card")) {
      const r = el.getBoundingClientRect();
      const dx = Math.abs(r.left + r.width / 2 - clientX);
      if (dx < bestDx) { bestDx = dx; best = el; }
    }
    const card = cards.find((c) => c.id === best?.getAttribute("data-card-id"));
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
      <div className="fan-stage">
        <div className="fan-speedlines" aria-hidden />
        <div ref={containerRef} className="fan-layout" data-testid="flash-fan"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={endDrag} onPointerLeave={endDrag}>
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
              <span className="fan-card-num" aria-hidden>{i + 1}</span>
              <span className="fan-card-cap">
                <span className="fan-card-label">{card.label}</span>
                {card.sub && <span className="fan-card-sub">{card.sub}</span>}
              </span>
              <span className="fan-wheel fan-wheel-l" aria-hidden />
              <span className="fan-wheel fan-wheel-r" aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div className="fan-controls">
        <button type="button" className="fan-arrow flash-press" data-testid="flash-prev"
          onClick={() => nudge(-1)} aria-label="Previous">{chevron("left")}</button>
        <div className="fan-dots" aria-hidden="true">
          {cards.map((c) => (<span key={c.id} className="fan-dot" />))}
        </div>
        <button type="button" className="fan-arrow flash-press" data-testid="flash-next"
          onClick={() => nudge(1)} aria-label="Next">{chevron("right")}</button>
      </div>
    </section>
  );
}
