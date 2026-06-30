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
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const activeDotRef = useRef(-1);
  const total = cards.length;
  const [reduced, setReduced] = useState(false);

  // Write every visible card's transform for the current flow value (one frame).
  const layout = useCallback(() => {
    const container = containerRef.current;
    if (!container || !total) return;
    const els = container.querySelectorAll<HTMLElement>(".fan-card");
    const mult = getResponsiveMultiplier(window.innerWidth);
    const hMult = getHeightMultiplier(window.innerWidth);
    const flow = flowRef.current;
    els.forEach((el, i) => {
      let rel = ((i - flow) % total + total) % total;
      if (rel > total / 2) rel -= total;             // centre the wrap: -N/2..N/2
      const t = fanAt(rel);
      el.style.transform =
        `translate(${(t.x * mult).toFixed(2)}rem, ${(t.y * hMult).toFixed(2)}rem) rotate(${t.rot.toFixed(2)}deg) scale(${t.scale.toFixed(3)})`;
      el.style.opacity = t.opacity.toFixed(3);
      el.style.zIndex = String(t.zIndex);
      el.style.pointerEvents = t.opacity > 0.05 ? "auto" : "none";
    });
    // Light the dot nearest centre (direct DOM, no per-frame React re-render).
    const active = ((Math.round(flow) % total) + total) % total;
    if (active !== activeDotRef.current) {
      const dots = container.parentElement?.querySelectorAll<HTMLElement>(".fan-dot");
      if (dots) {
        if (activeDotRef.current >= 0 && dots[activeDotRef.current]) dots[activeDotRef.current].classList.remove("is-on");
        if (dots[active]) dots[active].classList.add("is-on");
      }
      activeDotRef.current = active;
    }
  }, [total]);

  // Arrows nudge the river by one card (and refresh immediately when frozen).
  const nudge = useCallback((dir: 1 | -1) => { flowRef.current += dir; layout(); }, [layout]);

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

  // The river: one rAF loop advancing the fractional flow. Static under reduced motion.
  useEffect(() => {
    if (!total) return;
    if (reduced) { layout(); return; }
    const speed = autoAdvanceMs > 0 ? 1 / autoAdvanceMs : 0; // cards per ms
    layout();                                   // place before first paint (no stack flash)
    lastTimeRef.current = performance.now();
    const tick = (now: number) => {
      const dt = now - lastTimeRef.current; lastTimeRef.current = now;
      flowRef.current += dt * speed;
      layout();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    const onResize = () => layout();
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", onResize); };
  }, [total, reduced, autoAdvanceMs, layout]);

  if (!total) return null;

  return (
    <section className="fan-section" aria-label="Topics">
      <div ref={containerRef} className="fan-layout" data-testid="flash-fan">
        {cards.map((card) => (
          <button key={card.id} type="button"
            className={`fan-card${card.startable === false ? " is-locked" : ""}`}
            data-testid="flash-pick" data-card-id={card.id}
            disabled={card.startable === false}
            aria-label={`${card.label}${card.sub ? ", " + card.sub : ""}`}
            onClick={() => { if (card.startable !== false) onPick(card); }}>
            <span className="fan-card-media" style={{ "--fan-hue": card.hue } as React.CSSProperties}>
              {/* Eager + high priority: every card image fetches the moment the fan
                  mounts, so they're present as they flow into view. */}
              <img src={card.imgUrl} alt="" loading="eager" decoding="async" fetchPriority="high"
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
