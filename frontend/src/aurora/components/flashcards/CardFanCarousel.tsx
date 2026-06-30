"use client";
/* CardFanCarousel — an auto-rotating fan of portrait cards. Adapted from a
   donated GSAP "social cards" fan: same fan math (FAN_POSITIONS, responsive
   multipliers, entry/cycle/hover animation), retuned for our topic picker —
   labelled, click-to-pick cards, auto-advance that pauses on hover/focus, an
   <img> error fallback, and medical-blue controls. Reduced-motion safe. */
import { useState, useEffect, useRef, useCallback } from "react";
import gsap from "gsap";

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
  autoAdvanceMs?: number;
}

const MAX_VISIBLE = 7;
const HALF = 3;
const FAN_POSITIONS = [
  { rot: -21, scale: 0.7756, x: -30, y: 7.3, zIndex: 1 },
  { rot: -14, scale: 0.8498, x: -22, y: 4.0, zIndex: 2 },
  { rot: -7,  scale: 0.9346, x: -11, y: 1.3, zIndex: 3 },
  { rot: 0,   scale: 1.0,    x: 0,   y: 0.0, zIndex: 10 },
  { rot: 7,   scale: 0.9346, x: 11,  y: 1.3, zIndex: 3 },
  { rot: 14,  scale: 0.8498, x: 22,  y: 4.0, zIndex: 2 },
  { rot: 21,  scale: 0.7756, x: 30,  y: 7.3, zIndex: 1 },
];

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
  if (available >= idealPx) return 1;
  return available / idealPx;
}

function getSlotConfig(totalCards: number, slot: number) {
  if (totalCards >= MAX_VISIBLE) return FAN_POSITIONS[slot];
  const center = totalCards >> 1;
  const distance = totalCards > 1 ? (slot - center) / center : 0;
  const absDistance = Math.abs(distance);
  return {
    rot: distance * 21,
    scale: 1.0 - 0.2244 * absDistance * absDistance,
    x: distance * 30,
    y: absDistance * absDistance * 7.3,
    zIndex: 10 - Math.abs(slot - center),
  };
}

function prefersReducedMotion() {
  return typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-motion") === "reduce";
}

const chevron = (direction: "left" | "right") => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points={direction === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </svg>
);

export function CardFanCarousel({ cards, onPick, autoAdvanceMs = 2800 }: CardFanCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAnimating = useRef(false);
  const hasEntered = useRef(false);
  const directionRef = useRef<"left" | "right" | null>(null);
  const prevVisible = useRef<Set<number>>(new Set());

  const totalCards = cards.length;
  const needsPagination = totalCards > MAX_VISIBLE;
  const [centerIndex, setCenterIndex] = useState(needsPagination ? HALF : totalCards >> 1);

  const getVisibleMap = useCallback((center: number) => {
    const map = new Map<number, number>();
    if (!needsPagination) {
      cards.forEach((_, i) => map.set(i, i));
      return map;
    }
    for (let slot = 0; slot < MAX_VISIBLE; slot++) {
      map.set(((center + slot - HALF) % totalCards + totalCards) % totalCards, slot);
    }
    return map;
  }, [totalCards, needsPagination, cards]);

  const cycle = useCallback((direction: "left" | "right") => {
    if (isAnimating.current || !needsPagination) return;
    isAnimating.current = true;
    directionRef.current = direction;
    setCenterIndex(prev => direction === "right"
      ? (prev + 1) % totalCards
      : (prev - 1 + totalCards) % totalCards);
  }, [totalCards, needsPagination]);

  // Auto-advance: a calm, continuous rotation whenever paginated and motion is
  // allowed. It never pauses on hover — the fan fills the viewport, so pausing on
  // pointer presence froze it in practice; a hovered card may rotate away (the
  // accepted trade for "it actually rotates"). Arrows still nudge it manually.
  useEffect(() => {
    if (!needsPagination || autoAdvanceMs <= 0 || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      if (!isAnimating.current) cycle("right");
    }, autoAdvanceMs);
    return () => { window.clearInterval(id); };
  }, [needsPagination, autoAdvanceMs, cycle]);

  // Layout + hover physics (adapted donee). Honors reduced motion via gsap.set.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !totalCards) return;
    const cardElements = Array.from(container.querySelectorAll<HTMLElement>(".fan-card"));
    if (!cardElements.length) return;

    const reduce = prefersReducedMotion();
    const visibleMap = getVisibleMap(centerIndex);
    const previouslyVisible = prevVisible.current;
    const direction = directionRef.current;
    const isFirstMount = !hasEntered.current;
    const multiplier = getResponsiveMultiplier(window.innerWidth);
    const hMult = getHeightMultiplier(window.innerWidth);
    const slotCount = needsPagination ? MAX_VISIBLE : totalCards;
    const config = (slot: number) => getSlotConfig(slotCount, slot);

    if (isFirstMount) isAnimating.current = true;
    let completedCount = 0;
    const visibleCount = visibleMap.size;
    const onCardDone = () => {
      if (++completedCount >= visibleCount) {
        isAnimating.current = false;
        if (isFirstMount) hasEntered.current = true;
      }
    };

    cardElements.forEach((card, cardIndex) => {
      const slot = visibleMap.get(cardIndex);
      const wasVisible = previouslyVisible.has(cardIndex);
      if (slot !== undefined) {
        const { x, y, rot, scale, zIndex } = config(slot);
        const target = {
          x: `${x * multiplier}rem`, y: `${y * hMult}rem`,
          rotation: rot, scale, opacity: 1, zIndex,
        };
        if (reduce) {
          gsap.set(card, target);
          onCardDone();
        } else if (isFirstMount) {
          gsap.set(card, { x: 0, y: `${12 * hMult}rem`, rotation: 0, scale: 0.5, opacity: 0 });
          gsap.to(card, { ...target, duration: 1.2, ease: "elastic.out(1.05,.78)", delay: 0.2 + slot * 0.06, onComplete: onCardDone });
        } else if (!wasVisible) {
          const enterX = direction === "right" ? 40 : -40;
          gsap.set(card, { x: `${enterX}rem`, y: `${y * hMult}rem`, rotation: direction === "right" ? 30 : -30, scale: 0.5, opacity: 0 });
          gsap.to(card, { ...target, duration: 0.6, ease: "power2.out", onComplete: onCardDone });
        } else {
          gsap.to(card, { ...target, duration: 0.5, ease: "power2.out", onComplete: onCardDone });
        }
      } else if (wasVisible && !reduce) {
        const exitX = direction === "right" ? -40 : 40;
        gsap.to(card, { x: `${exitX}rem`, opacity: 0, scale: 0.5, rotation: direction === "right" ? -30 : 30, duration: 0.4, ease: "power2.in", zIndex: 0 });
      } else {
        gsap.set(card, { opacity: 0, scale: 0.3, x: 0, y: 0, zIndex: 0 });
      }
    });
    prevVisible.current = new Set(visibleMap.keys());

    if (reduce) return; // no hover physics under reduced motion

    const visibleEntries: { el: HTMLElement; slot: number }[] = [];
    cardElements.forEach((el, i) => {
      const slot = visibleMap.get(i);
      if (slot !== undefined) visibleEntries.push({ el, slot });
    });
    visibleEntries.sort((a, b) => a.slot - b.slot);
    let activeSlot: number | null = null;
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;
    const centerSlot = visibleEntries.length >> 1;

    const updateHoverLayout = (hoveredSlot: number | null) => {
      const mult = getResponsiveMultiplier(window.innerWidth);
      const hM = getHeightMultiplier(window.innerWidth);
      visibleEntries.forEach(({ el, slot }) => {
        const base = config(slot);
        let targetX = base.x * mult;
        let targetY = base.y * hM;
        let targetRot = base.rot;
        let targetScale = base.scale;
        let delay = 0;
        if (hoveredSlot !== null) {
          const distance = Math.abs(slot - hoveredSlot);
          delay = distance * 0.02;
          if (slot === hoveredSlot) {
            targetY -= 2.5 * hM; targetScale *= 1.08;
          } else {
            const normalized = centerSlot > 0 ? (slot - centerSlot) / centerSlot : 0;
            const pushStrength = 8 * (1 - Math.abs(normalized)) * (1 + 0.2 * Math.max(0, 3 - distance));
            if (slot < hoveredSlot) { targetX -= pushStrength * mult; targetRot -= 3 / (distance + 1); }
            else { targetX += pushStrength * mult; targetRot += 3 / (distance + 1); }
            if (slot === visibleEntries.length - 1 && hoveredSlot < centerSlot) targetY -= 1 * hM;
            if (slot === 0 && hoveredSlot > centerSlot) targetY -= 1 * hM;
          }
        } else {
          delay = Math.abs(slot - centerSlot) * 0.02;
        }
        gsap.to(el, { x: `${targetX}rem`, y: `${targetY}rem`, rotation: targetRot, scale: targetScale, duration: 0.5, delay, ease: "elastic.out(1,.75)", overwrite: "auto" });
        gsap.set(el, { zIndex: base.zIndex });
      });
    };

    const enterHandlers = visibleEntries.map(({ el, slot }) => {
      const handler = () => {
        if (isAnimating.current) return;
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
        if (activeSlot !== slot) { activeSlot = slot; updateHoverLayout(slot); }
      };
      el.addEventListener("mouseenter", handler);
      return { el, handler };
    });
    const onMouseLeave = () => {
      if (isAnimating.current) return;
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => { activeSlot = null; updateHoverLayout(null); }, 50);
    };
    container.addEventListener("mouseleave", onMouseLeave);
    const onResize = () => { if (!isAnimating.current) updateHoverLayout(activeSlot); };
    window.addEventListener("resize", onResize);

    return () => {
      gsap.killTweensOf(cardElements);
      enterHandlers.forEach(({ el, handler }) => el.removeEventListener("mouseenter", handler));
      container.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", onResize);
      if (leaveTimer) clearTimeout(leaveTimer);
    };
  }, [centerIndex, totalCards, getVisibleMap, needsPagination]);

  if (!totalCards) return null;

  return (
    <section className="fan-section" aria-label="Topics">
      <div ref={containerRef} className="fan-layout" data-testid="flash-fan">
        {cards.map((card) => (
          <button key={card.id} type="button"
            className={`fan-card flash-press${card.startable === false ? " is-locked" : ""}`}
            data-testid="flash-pick" data-card-id={card.id}
            disabled={card.startable === false}
            aria-label={`${card.label}${card.sub ? ", " + card.sub : ""}`}
            onClick={() => { if (card.startable !== false) onPick(card); }}>
            <span className="fan-card-media" style={{ "--fan-hue": card.hue } as React.CSSProperties}>
              {/* Eager + high priority: every card image fetches the moment the fan
                  mounts, so they're present on entry rather than popping in as cards
                  rotate into view. */}
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
      {needsPagination && (
        <div className="fan-controls">
          <button type="button" className="fan-arrow flash-press" data-testid="flash-prev"
            onClick={() => cycle("left")} aria-label="Previous">{chevron("left")}</button>
          <div className="fan-dots" aria-hidden="true">
            {cards.map((c, i) => (
              <span key={c.id} className={`fan-dot${i === centerIndex ? " is-on" : ""}`} />
            ))}
          </div>
          <button type="button" className="fan-arrow flash-press" data-testid="flash-next"
            onClick={() => cycle("right")} aria-label="Next">{chevron("right")}</button>
        </div>
      )}
    </section>
  );
}
