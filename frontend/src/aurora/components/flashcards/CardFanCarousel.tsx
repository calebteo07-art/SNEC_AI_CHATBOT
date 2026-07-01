"use client";
/* CardFanCarousel — an arced fan of portrait topic cards that flows CONTINUOUSLY
   like a river. A single rAF loop advances a fractional "flow" offset and writes
   each card's transform every frame, so cards glide smoothly through the fan instead
   of ticking card-by-card. The middle card is largest; cards fade as they slide off
   one edge and seamlessly re-enter from the other. Click a card to pick it; the
   arrows nudge the river by one card. Reactive to reduced motion (freezes to a
   static fan) — also so automated clicks land on a stable card. */
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
  /** Milliseconds the river takes to flow one card-width (the continuous pace). */
  autoAdvanceMs?: number;
}

// Fan control points — slot offset -3..+3 from centre (index 0..6). The continuous
// layout lerps between these, so the arc matches the original stepped fan exactly at
// integer offsets and interpolates smoothly in between.
const FAN = [
  { rot: -21, scale: 0.7756, x: -30, y: 7.3 },
  { rot: -14, scale: 0.8498, x: -22, y: 4.0 },
  { rot: -7,  scale: 0.9346, x: -11, y: 1.3 },
  { rot: 0,   scale: 1.0,    x: 0,   y: 0.0 },
  { rot: 7,   scale: 0.9346, x: 11,  y: 1.3 },
  { rot: 14,  scale: 0.8498, x: 22,  y: 4.0 },
  { rot: 21,  scale: 0.7756, x: 30,  y: 7.3 },
];
const SPAN = 3; // visible half-width in slot units (the fan shows ~7 cards)

function getResponsiveMultiplier(width: number) {
  if (width < 480) return 0.32;
  if (width < 640) return 0.42;
  if (width < 768) return 0.58;
  if (width < 1024) return 0.85;
  return 1.18;
}

function getHeightMultiplier(width: number) {
  let idealPx: number;
  if (width < 480) idealPx = 22 * 16;
  else if (width < 640) idealPx = 26 * 16;
  else if (width < 768) idealPx = 28 * 16;
  else if (width < 1024) idealPx = 34 * 16;
  else idealPx = 38 * 16;
  const available = window.innerHeight * 0.7;
  return available >= idealPx ? 1 : available / idealPx;
}

function isReduced() {
  return (typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-motion") === "reduce") ||
    (typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

type FanKey = keyof (typeof FAN)[number];

// Continuous fan transform for a signed slot offset `rel` (0 = centre). Inside the
// fan it lerps the control points; past the edge it slides the card further out and
// fades it so the wrap to the other side is invisible.
function fanAt(rel: number) {
  const a = Math.abs(rel), s = Math.sign(rel);
  let x: number, y: number, rot: number, scale: number, opacity: number;
  if (a <= SPAN) {
    const idx = rel + SPAN;                 // 0..6 (float)
    const i0 = Math.floor(idx), i1 = Math.min(6, i0 + 1), f = idx - i0;
    const L = (k: FanKey) => FAN[i0][k] + (FAN[i1][k] - FAN[i0][k]) * f;
    x = L("x"); y = L("y"); rot = L("rot"); scale = L("scale"); opacity = 1;
  } else {
    const over = a - SPAN;
    x = s * (30 + over * 26);
    y = 7.3 + over * 3;
    rot = s * (21 + over * 6);
    scale = Math.max(0.5, 0.7756 - over * 0.25);
    opacity = Math.max(0, 1 - over / 0.85);
  }
  return { x, y, rot, scale, opacity, zIndex: Math.round(100 - a * 10) };
}

const chevron = (direction: "left" | "right") => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points={direction === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </svg>
);

export function CardFanCarousel({ cards, onPick, autoAdvanceMs = 2600 }: CardFanCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef(0);
  const paintRef = useRef<() => void>(() => {});
  const activeDotRef = useRef(-1);
  const total = cards.length;
  const [reduced, setReduced] = useState(false);

  // Arrows nudge the river by one card (repaint immediately, esp. when frozen).
  const nudge = useCallback((dir: 1 | -1) => { flowRef.current += dir; paintRef.current(); }, []);

  // Track reduced motion, including live changes — the test harness toggles it, and
  // the profile toggle flips html[data-motion]. Freezing on demand also lets an
  // automated click land on a stable (non-animating) card.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(isReduced());
    apply();
    mq.addEventListener("change", apply);
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => { mq.removeEventListener("change", apply); obs.disconnect(); };
  }, []);

  // The river. Smoothness is everything here, so per-frame work is minimal: the card
  // nodes, the dot nodes and the responsive multipliers are read ONCE (and on resize)
  // — never per frame (reading window.innerWidth/innerHeight or querying the DOM each
  // frame forces a synchronous reflow → the judder we're avoiding). Each frame only
  // writes a GPU translate3d + opacity; z-index / pointer-events are touched solely
  // when they actually change. Static under reduced motion.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !total) return;
    const els = Array.from(container.querySelectorAll<HTMLElement>(".fan-card"));
    const dots = Array.from(container.parentElement?.querySelectorAll<HTMLElement>(".fan-dot") ?? []);
    const zCache = new Array(els.length).fill(NaN);
    const peCache = new Array(els.length).fill(-1);
    let mult = getResponsiveMultiplier(window.innerWidth);
    let hMult = getHeightMultiplier(window.innerWidth);

    const paint = () => {
      const flow = flowRef.current;
      for (let i = 0; i < els.length; i++) {
        let rel = ((i - flow) % total + total) % total;
        if (rel > total / 2) rel -= total;          // centre the wrap: -N/2..N/2
        const t = fanAt(rel);
        els[i].style.transform =
          `translate3d(${(t.x * mult).toFixed(2)}rem,${(t.y * hMult).toFixed(2)}rem,0) rotate(${t.rot.toFixed(2)}deg) scale(${t.scale.toFixed(3)})`;
        els[i].style.opacity = t.opacity.toFixed(3);
        if (zCache[i] !== t.zIndex) { els[i].style.zIndex = String(t.zIndex); zCache[i] = t.zIndex; }
        const pe = t.opacity > 0.05 ? 1 : 0;
        if (peCache[i] !== pe) { els[i].style.pointerEvents = pe ? "auto" : "none"; peCache[i] = pe; }
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

    const onResize = () => { mult = getResponsiveMultiplier(window.innerWidth); hMult = getHeightMultiplier(window.innerWidth); paint(); };
    window.addEventListener("resize", onResize);

    let raf = 0;
    if (!reduced) {
      const speed = autoAdvanceMs > 0 ? 1 / autoAdvanceMs : 0; // cards per ms
      let last = performance.now();
      const tick = (now: number) => {
        const dt = now - last; last = now;
        flowRef.current += dt * speed;
        paint();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [total, reduced, autoAdvanceMs]);

  if (!total) return null;

  return (
    <section className="fan-section" aria-label="Topics">
      <div ref={containerRef} className="fan-layout" data-testid="flash-fan">
        {cards.map((card, i) => (
          <button key={card.id} type="button"
            className={`fan-card${card.startable === false ? " is-locked" : ""}`}
            data-testid="flash-pick" data-card-id={card.id}
            disabled={card.startable === false}
            aria-label={`${card.label}${card.sub ? ", " + card.sub : ""}`}
            onClick={() => { if (card.startable !== false) onPick(card); }}>
            <span className="fan-card-media" style={{ "--fan-hue": card.hue } as React.CSSProperties}>
              {/* Prioritise only the card that starts centred; the rest fetch at LOW
                  priority so they don't all contend as "critical" and starve the one
                  the user is actually looking at. They still flow in well before their
                  turn on the river. */}
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
