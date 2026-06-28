# Flashcards Topic Fan-Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flashcards step-2 topic grid with an auto-rotating fan of photographic topic cards; one click on any card starts that deck.

**Architecture:** Adapt a donated GSAP fan-carousel into a themed `CardFanCarousel`, driven by a thin `StepTopic` that maps the role-filtered topic sets (already served by `/api/flashcards/topics`) to labelled, click-to-start cards on the existing medical-blue selection surface. Per-topic imagery comes from a new Nano Banana generator, with a hue-tinted placeholder fallback so the feature ships and tests green before any paid generation.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, GSAP 3 (already a dep), Tailwind 4 + `aurora.css`, Playwright integration harness (`frontend/tests/aurora_assert.mjs`), Python 3.12 / pytest, `google-genai` (`gemini-3-pro-image`).

**Testing note:** The frontend has no unit harness — it is verified by the Playwright integration suite (`aurora_assert.mjs`), so frontend tasks implement first, then verify the suite. The backend prompt-coverage check uses strict TDD (red → green).

---

## File structure

- Create `frontend/src/aurora/components/flashcards/CardFanCarousel.tsx` — generic auto-rotating fan (adapted donee). Fan math + GSAP + auto-advance + image fallback. **Not** `/components/ui` (this is not a shadcn repo; the design-system home is `src/aurora/components/<feature>/`).
- Modify `frontend/src/aurora/components/flashcards/StepTopic.tsx` — rewrite to map sets → `FanCard[]` (Mixed first) and start on pick. Owns `topicImage()`.
- Modify `frontend/src/aurora/components/flashcards/SessionSetup.tsx` — drop the per-selection hue tracking; pass `sets` + `onBack` + `onStart` to the new `StepTopic`.
- Modify `frontend/src/aurora/aurora.css` — add `.fan-*` and `.flash-step-sub` styles inside the existing `.flash-root:has(.flash-setup)` selection block.
- Modify `frontend/tests/aurora_assert.mjs` — mock `/api/flashcards/topics`, assert the fan, click a card to start (both the main and the stale-card paths).
- Create `tools/media/generate_flashcards_topics.py` — `SUBJECTS` table (30 topics + `__mixed`) + `build_prompt()` + paid `main()`.
- Create `tests/test_flashcards_topic_prompts.py` — pure coverage/ASCII test for `SUBJECTS`.
- Generated later (gated): `frontend/public/media/flashcards/topics/<topic_key>.png` + `mixed.png`.

---

### Task 1: Fan-carousel CSS

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (insert after the `.flash-back` rule, around line 2446, inside the selection block)

- [ ] **Step 1: Add the `.fan-*` + `.flash-step-sub` styles**

Insert this block immediately after the `.flash-back:hover { ... }` rule (~line 2446):

```css
/* ── Topic fan carousel (step 2) ───────────────────────────────────────────
   An auto-rotating fan of portrait topic cards on the light azure room. Cards
   are dark photo tiles with a legible gradient caption; controls are medical
   blue. The section breaks out past the 760px setup column so the fan can
   spread. .fan-card transforms are driven by GSAP (CardFanCarousel). */
.flash-step-sub { text-align: center; margin: 6px 0 0;
  font: 400 13.5px var(--font-sans); color: var(--f-mono); }

.fan-section { position: relative; width: 96vw; max-width: 80rem;
  margin-left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 12px; }
.fan-layout { position: relative; width: 100%; height: 34rem; }
@media (min-width: 1280px) { .fan-layout { height: 38rem; } }
@media (max-width: 1023px) { .fan-layout { height: 30rem; } }
@media (max-width: 767px)  { .fan-layout { height: 26rem; } }
@media (max-width: 639px)  { .fan-layout { height: 24rem; } }
@media (max-width: 479px)  { .fan-layout { height: 22rem; } }

.fan-card { position: absolute; left: 50%; top: 50%;
  width: 13rem; height: 19rem; margin-left: -6.5rem; margin-top: -9.5rem;
  border: none; padding: 0; cursor: pointer; overflow: hidden;
  border-radius: 18px; background: #0b1f38;
  box-shadow: 0 18px 40px -18px rgba(8,29,56,.55), 0 2px 8px rgba(8,29,56,.18);
  outline: 2px solid transparent; outline-offset: 2px; will-change: transform; }
.fan-card:focus-visible { outline-color: var(--f-azure); }
.fan-card.is-locked { cursor: not-allowed; }
.fan-card-media { position: absolute; inset: 0; display: block; }
.fan-card-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fan-card.is-placeholder .fan-card-media img { display: none; }
.fan-card.is-placeholder .fan-card-media {
  background: radial-gradient(120% 92% at 50% 0%,
    hsl(var(--fan-hue) 70% 62% / .95), hsl(var(--fan-hue) 64% 34%) 68%,
    hsl(var(--fan-hue) 60% 22%)); }
.fan-card-cap { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;
  display: flex; flex-direction: column; gap: 2px; padding: 32px 14px 14px;
  text-align: left;
  background: linear-gradient(180deg, transparent, rgba(6,17,32,.5) 38%, rgba(6,17,32,.92)); }
.fan-card-label { font: 600 15px var(--font-sans); color: #fff; line-height: 1.15; }
.fan-card-sub { font: 500 12px var(--font-sans); color: rgba(231,241,255,.82); }
.fan-card.is-locked .fan-card-cap::after { content: "coming soon";
  margin-top: 4px; font: 600 10px var(--font-mono); letter-spacing: .12em;
  text-transform: uppercase; color: rgba(231,241,255,.7); }

.fan-controls { display: flex; align-items: center; justify-content: center; gap: 16px; }
.fan-arrow { width: 42px; height: 42px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  color: var(--f-blue); background: rgba(255,255,255,.82);
  border: 1.5px solid rgba(31,95,166,.18);
  box-shadow: 0 6px 18px -8px rgba(31,95,166,.5); }
.fan-arrow:hover { color: #fff; background: var(--f-azure); border-color: var(--f-azure); }
.fan-dots { display: flex; align-items: center; gap: 7px; }
.fan-dot { width: 7px; height: 7px; border-radius: 999px;
  background: rgba(31,95,166,.22); transition: transform .3s ease, background .3s ease; }
.fan-dot.is-on { background: var(--f-blue); transform: scale(1.4); }
html[data-motion="reduce"] .fan-card, html[data-motion="reduce"] .fan-dot { transition: none; }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "feat(flashcards): fan-carousel + step-sub styles"
```

---

### Task 2: `CardFanCarousel` component

**Files:**
- Create: `frontend/src/aurora/components/flashcards/CardFanCarousel.tsx`

- [ ] **Step 1: Create the component**

```tsx
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
  if (width < 480) return 0.28;
  if (width < 640) return 0.38;
  if (width < 768) return 0.5;
  if (width < 1024) return 0.75;
  return 1.0;
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
  <svg className="fan-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"
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
  const pausedRef = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const pauseAuto = useCallback(() => {
    pausedRef.current = true;
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
  }, []);
  const resumeAuto = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { pausedRef.current = false; }, 1200);
  }, []);

  // Auto-advance: only when paginated and motion is allowed; pauses on hover/focus.
  useEffect(() => {
    if (!needsPagination || autoAdvanceMs <= 0 || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      if (!pausedRef.current && !isAnimating.current) cycle("right");
    }, autoAdvanceMs);
    return () => { window.clearInterval(id); if (resumeTimer.current) clearTimeout(resumeTimer.current); };
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
      enterHandlers.forEach(({ el, handler }) => el.removeEventListener("mouseenter", handler));
      container.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", onResize);
      if (leaveTimer) clearTimeout(leaveTimer);
    };
  }, [centerIndex, totalCards, getVisibleMap, needsPagination]);

  if (!totalCards) return null;

  return (
    <section className="fan-section" aria-label="Topics"
      onPointerEnter={pauseAuto} onPointerLeave={resumeAuto}
      onFocusCapture={pauseAuto} onBlurCapture={resumeAuto}>
      <div ref={containerRef} className="fan-layout" data-testid="flash-fan">
        {cards.map((card) => (
          <button key={card.id} type="button"
            className={`fan-card flash-press${card.startable === false ? " is-locked" : ""}`}
            data-testid="flash-pick" data-card-id={card.id}
            disabled={card.startable === false}
            aria-label={`${card.label}${card.sub ? ", " + card.sub : ""}`}
            onClick={() => { if (card.startable !== false) onPick(card); }}>
            <span className="fan-card-media" style={{ "--fan-hue": card.hue } as React.CSSProperties}>
              <img src={card.imgUrl} alt="" loading="lazy"
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/aurora/components/flashcards/CardFanCarousel.tsx
git commit -m "feat(flashcards): CardFanCarousel auto-rotating fan"
```

---

### Task 3: Rewrite `StepTopic` + simplify `SessionSetup`

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/StepTopic.tsx` (full replace)
- Modify: `frontend/src/aurora/components/flashcards/SessionSetup.tsx` (full replace)

- [ ] **Step 1: Replace `StepTopic.tsx` with the fan version**

```tsx
"use client";
/* StepTopic — step 2 of the flashcards intake: the topic fan. Maps the
   role-filtered, difficulty-filtered sets to carousel cards (Mixed first), and
   starts a deck the moment a card is picked. Role access is enforced upstream
   by /api/flashcards/topics; this only renders what it is given. */
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { galleryHue } from "./types";
import { CardFanCarousel, type FanCard } from "./CardFanCarousel";

const MIXED_HUE = 212;

/** topic_key → its generated portrait. Missing files fall back to a hue
 *  placeholder inside the card (CardFanCarousel onError), so this never throws. */
export function topicImage(topicKey: string): string {
  const file = topicKey === "__mixed" ? "mixed" : topicKey;
  return `/media/flashcards/topics/${file}.png`;
}

interface Props {
  sets: FlashcardSetInfo[];
  onBack: () => void;
  onStart: (setKey: string | null) => void;
}

export function StepTopic({ sets, onBack, onStart }: Props) {
  const cards: FanCard[] = [
    { id: "__mixed", label: "Mixed", sub: "full spectrum", hue: MIXED_HUE,
      imgUrl: topicImage("__mixed"), startable: true },
    ...sets.map((s, i) => ({
      id: s.set_key,
      label: s.label,
      sub: `${s.total} cards`,
      hue: galleryHue(i),
      imgUrl: topicImage(s.topic_key),
      startable: s.total > 0,
    })),
  ];

  return (
    <div className="flash-step-body">
      <div className="flash-step-lede">
        <h2 className="flash-setup-title">Topics</h2>
        <p className="flash-step-sub">The cards drift on their own — tap the one you want to start.</p>
      </div>

      <CardFanCarousel
        cards={cards}
        onPick={(c) => onStart(c.id === "__mixed" ? null : c.id)} />

      <div className="flash-step-foot">
        <button type="button" className="flash-back flash-press" data-testid="flash-back"
          onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `SessionSetup.tsx` (drop selection-hue tracking)**

```tsx
"use client";
/* SessionSetup — the two-step flashcards intake shell. Owns the step (1|2) and
   renders a 2-segment progress rail plus the keyed step content (StepSession →
   StepTopic). The chrome stays medical-blue; step 2 is a click-to-start topic
   fan, so there is no persistent selection state here. */
import { useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { type Difficulty } from "./types";
import { StepSession } from "./StepSession";
import { StepTopic } from "./StepTopic";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  difficulty: Difficulty; setDifficulty: (d: Difficulty) => void;
  sessionLength: number; setSessionLength: (n: number) => void;
  onStart: (setKey: string | null) => void;
}

export function SessionSetup({
  topicSets, difficulty, setDifficulty, sessionLength, setSessionLength, onStart,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);

  return (
    <div className="flash-setup" data-testid="flash-setup" data-step={step}
      style={{ "--flash-topic-hue": 212 } as React.CSSProperties}>
      <div className="flash-rail" data-testid="flash-rail" role="progressbar"
        aria-valuemin={1} aria-valuemax={2} aria-valuenow={step} aria-label="Setup progress">
        <span className={`flash-rail-seg${step === 1 ? " is-active" : ""}${step > 1 ? " is-done" : ""}`} />
        <span className={`flash-rail-seg${step === 2 ? " is-active" : ""}`} />
      </div>

      <div className="flash-setup-stage">
        <div className="flash-step" key={step}>
          {step === 1 ? (
            <StepSession difficulty={difficulty} pickDifficulty={setDifficulty}
              sessionLength={sessionLength} setSessionLength={setSessionLength}
              onContinue={() => setStep(2)} />
          ) : (
            <StepTopic sets={sets} onBack={() => setStep(1)} onStart={onStart} />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors (no references to the removed `selected`/`showAll` props remain).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/components/flashcards/StepTopic.tsx frontend/src/aurora/components/flashcards/SessionSetup.tsx
git commit -m "feat(flashcards): step-2 topic fan, click-to-start"
```

---

### Task 4: Update the Playwright harness

**Files:**
- Modify: `frontend/tests/aurora_assert.mjs`

The current flashcards block clicks `[data-testid="flash-start"]` (removed). Update both paths to click a card, mock topics for the main path, and assert the fan.

- [ ] **Step 1: Mock `/api/flashcards/topics` for the main path**

Find the line that adds the `check` route (around line 163):

```js
await navCtx.route("**/api/flashcards/check", (r) => r.fulfill(JSON_OK({ score: 88, feedback: "Good reasoning — immediate irrigation limits damage.", mock_mode: true })));
```

Add immediately after it:

```js
// topics: 8 easy CLINICAL sets so step 2 paginates the fan (8 + Mixed = 9 > 7).
await navCtx.route("**/api/flashcards/topics", (r) => r.fulfill(JSON_OK({ sets: [
  ["ocular_emergencies", "Ocular Emergencies"], ["red_eye", "Red Eye Differential"],
  ["triage", "Triage Categories"], ["history_taking", "History Taking"],
  ["distance_va", "Distance Visual Acuity"], ["near_vision", "Near Vision"],
  ["pinhole", "Pinhole Testing"], ["iop_nct", "IOP & Non-Contact Tonometry"],
].map(([topic_key, label]) => ({ set_key: `${topic_key}__easy`, topic_key, label, difficulty: "easy", total: 5, completed: 0 })) })));
```

- [ ] **Step 2: Replace the main-path step-2 start with fan assertions + a card click**

Find (around line 180-182):

```js
// Mixed is selected by default on step 2 — Start commits straight away (topics are unmocked here).
await np.locator('[data-testid="flash-start"]').click();
await np.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });
```

Replace with:

```js
// step 2 is an auto-rotating topic fan: Mixed + the 8 mocked topics, with
// pagination controls. One click on any card starts that deck.
await np.waitForSelector('[data-testid="flash-fan"]', { timeout: 15000 });
const fanCount = await np.locator('[data-testid="flash-pick"]').count();
if (fanCount !== 9) { console.error(`FAIL: topic fan card count = ${fanCount} (want 9)`); process.exit(1); }
if ((await np.locator('[data-testid="flash-prev"]').count()) < 1) { console.error("FAIL: topic fan pagination arrows missing"); process.exit(1); }
console.log("PASS: Flashcards — topic fan renders Mixed + topics with controls");
await np.locator('[data-card-id="ocular_emergencies__easy"]').click();
await np.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });
```

- [ ] **Step 3: Fix the stale-card path (click Mixed instead of Start)**

Find (around line 420-422):

```js
await stp.locator('[data-testid="flash-continue"]').click();
await stp.waitForSelector('[data-testid="flash-setup"][data-step="2"]', { timeout: 15000 });
await stp.locator('[data-testid="flash-start"]').click();
```

Replace the third line with:

```js
await stp.locator('[data-card-id="__mixed"]').click();
```

(`staleCtx` routes `**/api/**` → `{}`, so topics are empty and only the Mixed card renders; clicking it starts the mixed deck, whose stale card is filtered out → the graceful `.flash-msg` empty state, as the assertions below expect.)

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/aurora_assert.mjs
git commit -m "test(flashcards): harness for topic fan + click-to-start"
```

---

### Task 5: Build + run the harness (frontend verification)

**Files:** none (verification)

- [ ] **Step 1: Build the standalone server**

Run (from repo root, Bash tool):
```bash
cd frontend && npm run build
```
Expected: build succeeds (no type errors, no missing-module errors for `CardFanCarousel`).

- [ ] **Step 2: Assemble + start the standalone server**

Per the harness convention (output:standalone), copy static assets and run the server:
```bash
cd frontend && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && (node .next/standalone/server.js &) && sleep 4
```
Expected: server listening on `127.0.0.1:3000`.

- [ ] **Step 3: Run the flashcards harness**

Run:
```bash
node frontend/tests/aurora_assert.mjs
```
Expected: all PASS lines print, including:
- `PASS: Flashcards — topic fan renders Mixed + topics with controls`
- `PASS: flashcards — single-answer tap reveals instantly (no submit)`
- `PASS: flashcards — stale/old-shaped cards degrade gracefully (no white-screen)`

Process exits 0. If a selector times out, confirm the server was rebuilt after the component changes and that `data-testid` values match.

- [ ] **Step 4: Stop the server**

Run:
```bash
pkill -f "standalone/server.js" || true
```

- [ ] **Step 5: Commit (if the harness needed any selector tweaks)**

```bash
git add -A && git commit -m "test(flashcards): green topic-fan harness" || echo "nothing to commit"
```

---

### Task 6: Failing test for topic prompt coverage (TDD)

**Files:**
- Create: `tests/test_flashcards_topic_prompts.py`

- [ ] **Step 1: Write the failing test**

```python
"""The topic-image generator must cover every flashcard topic (both pools) plus
the mixed deck, with ASCII-only, non-empty prompts. Pure — no API calls."""
from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS
from tools.media.generate_flashcards_topics import SUBJECTS, build_prompt


def _expected_keys() -> set[str]:
    keys = {"__mixed"}
    for pool in FLASHCARD_TOPICS.values():
        for topic_key, _label in pool:
            keys.add(topic_key)
    return keys


def test_subjects_cover_all_topics_and_mixed():
    assert set(SUBJECTS.keys()) == _expected_keys()


def test_subjects_ascii_and_nonempty():
    for key, subject in SUBJECTS.items():
        assert subject.strip(), f"empty subject for {key}"
        subject.encode("ascii")  # raises UnicodeEncodeError on non-ASCII


def test_build_prompt_includes_subject_and_negatives():
    prompt = build_prompt("oct_macula")
    assert SUBJECTS["oct_macula"] in prompt
    assert "no text" in prompt.lower()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_flashcards_topic_prompts.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.media.generate_flashcards_topics'`.

---

### Task 7: Create the topic-image generator

**Files:**
- Create: `tools/media/generate_flashcards_topics.py`

- [ ] **Step 1: Write the generator**

```python
"""Generate per-topic flashcard images for the step-2 topic fan.

One portrait image per flashcard topic (both pools) plus a mixed cover, written
to frontend/public/media/flashcards/topics/<topic_key>.png (mixed.png for the
mixed deck). Photoreal, medically/anatomically accurate; clinical-scene topics
use authentic Singapore eye-clinic settings with SingHealth blue scrubs and
orange trim. Mirrors generate_flashcards_hero.py.

PAID API -- run deliberately, only on explicit go-ahead.

    python tools/media/generate_flashcards_topics.py                 # all 31
    python tools/media/generate_flashcards_topics.py --pool OT        # one pool
    python tools/media/generate_flashcards_topics.py --only oct_macula

Without GEMINI_API_KEY it exits without calling anything. ASCII-only output.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env")

from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS  # noqa: E402

OUT_DIR = PROJECT_ROOT / "frontend" / "public" / "media" / "flashcards" / "topics"

STYLE = (
    "Ultra-realistic, photorealistic clinical photograph for premium "
    "medical education. Soft natural lighting, shallow depth of field, "
    "tack-sharp focus on the subject, portrait orientation, gallery quality."
)
NEG = (
    "Absolutely no text, no letters, no numbers, no labels, no arrows, no "
    "measurement overlays, no on-screen readouts, no UI elements, no watermark, "
    "no logos."
)
DRESS = (
    "Authentic Singapore eye-clinic setting; any staff wear SingHealth blue "
    "scrubs with orange trim."
)

# Subject phrase per topic_key. Concrete topics depict the eye/instrument; the
# genuinely abstract topics depict an evocative, accurate clinical scene.
SUBJECTS: dict[str, str] = {
    "__mixed":
        "A mesmerizing macro of a single human iris in exquisite jewel-like "
        "detail, inviting and premium, evoking the whole spectrum of eye care.",
    # ── CLINICAL pool (OA / PSA) ──
    "ocular_emergencies":
        "A dramatic close-up of an acutely red, painful, inflamed human eye "
        "conveying a true ocular emergency, clinically accurate surface detail.",
    "red_eye":
        "A clinically accurate macro of a markedly red eye with diffuse "
        "conjunctival injection and watering, true-to-life vasculature.",
    "triage":
        f"{DRESS} A calm clinic triage moment: a nurse attentively assessing a "
        "seated patient at a triage station.",
    "history_taking":
        f"{DRESS} An ophthalmic assistant warmly interviewing a patient across "
        "a clinic desk, professional and attentive.",
    "distance_va":
        "A patient seated in a clinic lane reading a back-lit distance "
        "visual-acuity letter chart, the chart softly out of focus behind.",
    "near_vision":
        "A near-vision reading card held at reading distance in a patient's "
        "hands under warm light, fine print, clinically authentic.",
    "pinhole":
        "A black pinhole occluder held before a patient's eye during "
        "refraction, macro, clinically authentic.",
    "iop_nct":
        "A non-contact air-puff tonometer aligned to a patient's eye, the "
        "instrument's soft blue alignment glow, clinical close-up.",
    "eye_drops":
        "A gloved clinician instilling a single eye drop into a patient's "
        "everted lower lid, the droplet caught mid-fall, sterile and precise.",
    "pupil_dilation":
        "A macro of a widely dilated dark pupil with a faint mydriatic sheen "
        "and richly detailed iris, clinically accurate.",
    "colour_vision":
        "An extreme close-up of a pseudoisochromatic colour-vision test plate "
        "as an abstract field of coloured dots, crisp dot texture, no figure.",
    "amsler_macula":
        "A vivid retinal fundus photograph centred on the macula with the "
        "foveal reflex and fine vasculature, clinically accurate.",
    "fall_risk":
        f"{DRESS} An elderly patient safely guided by a staff member along a "
        "clinic corridor with a handrail, caring and attentive.",
    "perioperative":
        f"{DRESS} A calm pre-operative ophthalmic prep: a patient resting on a "
        "day-surgery trolley with a nurse nearby in a serene theatre anteroom.",
    "abbreviations":
        "A tidy ophthalmic clinic desk still-life with a closed patient chart "
        "folder and pen under warm light, shallow focus, calm and clean.",
    # ── OT pool ──
    "oct_macula":
        "A patient at an OCT scanner chin-rest as it captures a macular scan, "
        "the instrument optics aglow, clinical close-up.",
    "oct_rnfl":
        "A patient positioned at an OCT instrument for a retinal nerve-fibre "
        "scan, the scanning optics glowing, clinical close-up.",
    "hvf":
        "A patient seated at a white Humphrey visual-field bowl perimeter with "
        "a hand on the response button, the bowl softly lit, clinical.",
    "gvf":
        "A Goldmann kinetic perimeter bowl with the examiner's projection arm, "
        "precision vintage instrument, clinical close-up.",
    "ascan_biometry":
        "An ultrasound A-scan biometry probe gently contacting an anaesthetised "
        "eye for axial-length measurement, sterile clinical macro.",
    "optical_biometry":
        "A patient at an optical biometer capturing axial length, the alignment "
        "optics glowing, clinical close-up.",
    "endothelial":
        "A specular microscope aligned to a patient's eye capturing corneal "
        "endothelial cells, the instrument optics, clinical close-up.",
    "asoct":
        "An anterior-segment OCT aligned to a patient's eye capturing the "
        "cornea and angle, instrument optics, clinical close-up.",
    "flare":
        "A laser-flare meter aligned to a patient's eye measuring "
        "anterior-chamber flare, instrument optics, clinical close-up.",
    "corneal_topography":
        "A Placido-disc corneal topographer with its concentric ring "
        "reflection mirrored on a patient's cornea, vivid rings, clinical macro.",
    "pam":
        "A potential-acuity meter projecting a tiny acuity target into a "
        "patient's eye through the optics, clinical close-up.",
    "hrt":
        "A Heidelberg retinal tomograph scanning a patient's optic disc, "
        "confocal laser optics aglow, clinical close-up.",
    "orthoptics":
        f"{DRESS} An orthoptist performing a cover test on a child with a "
        "paddle occluder, warm and engaging.",
    "dayward_theatre":
        f"{DRESS} A calm ophthalmic operating theatre with a surgical "
        "microscope and gowned staff, sterile and serene.",
    "auto_refraction":
        "A patient at an auto-refractor and keratometer with chin on the rest "
        "looking into the optics, the instrument's target glow, clinical.",
}


def build_prompt(topic_key: str) -> str:
    return f"{STYLE} {SUBJECTS[topic_key]} {NEG}"


def _selected_keys(pool: str, only: str | None) -> list[str]:
    if only:
        return [only]
    keys = ["__mixed"]
    pools = FLASHCARD_TOPICS if pool == "all" else {pool: FLASHCARD_TOPICS[pool]}
    for topic_list in pools.values():
        keys.extend(k for k, _label in topic_list)
    return keys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pool", default="all", choices=["all", "CLINICAL", "OT"])
    parser.add_argument("--only", default=None, help="single topic_key (or __mixed)")
    parser.add_argument("--count", type=int, default=1, help="candidates per topic")
    parser.add_argument("--aspect", default="3:4")
    args = parser.parse_args()

    if args.only and args.only not in SUBJECTS:
        print(f"unknown topic_key: {args.only}")
        return 1
    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    keys = _selected_keys(args.pool, args.only)
    print(f"generating {len(keys)} topic image(s) @ {args.aspect} ({model})")

    written = 0
    for key in keys:
        stem = "mixed" if key == "__mixed" else key
        for n in range(args.count):
            suffix = "" if args.count == 1 else f"-{n:02d}"
            try:
                res = client.models.generate_content(
                    model=model,
                    contents=build_prompt(key),
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                        image_config=types.ImageConfig(aspect_ratio=args.aspect),
                    ),
                )
                saved = False
                for part in res.candidates[0].content.parts:
                    if getattr(part, "inline_data", None):
                        out = OUT_DIR / f"{stem}{suffix}.png"
                        out.write_bytes(part.inline_data.data)
                        print(f"  ok {out.name} ({len(part.inline_data.data) // 1024} KB)")
                        written += 1
                        saved = True
                        break
                if not saved:
                    print(f"  WARN {key}{suffix}: no image part returned")
            except Exception as exc:  # noqa: BLE001 - one bad call shouldn't kill the run
                print(f"  ERROR {key}{suffix}: {type(exc).__name__}: {str(exc)[:160]}")

    print(f"done: {written} image(s) -> {OUT_DIR}")
    print("Review candidates; for --count>1 pick the best and drop the -NN suffix.")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `python -m pytest tests/test_flashcards_topic_prompts.py -q`
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add tools/media/generate_flashcards_topics.py tests/test_flashcards_topic_prompts.py
git commit -m "feat(media): per-topic flashcard image generator + coverage test"
```

---

### Task 8: Full verification

**Files:** none (verification)

- [ ] **Step 1: Backend suite (CI parity)**

Run: `python -m pytest -q`
Expected: all green (prior count + 3 new). No live API calls (MOCK_MODE auto-enabled).

- [ ] **Step 2: Frontend typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 3: Re-run the visual harness** (rebuild already done in Step 2)

Assemble + start the standalone server (Task 5 Step 2), then:
```bash
node frontend/tests/aurora_assert.mjs
```
Expected: all PASS, exit 0. Then stop the server (`pkill -f "standalone/server.js"`).

- [ ] **Step 4: Manual screenshot sanity (optional but recommended)**

With the server running and an authed session (see `frontend/tests/aurora_assert.mjs` auth/check-in setup), capture `/flashcards` step 2 and confirm: the fan renders, cards show hue placeholders (no images yet), Mixed is first, arrows + dots present, the fan auto-rotates, and clicking a card starts a deck.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A && git commit -m "chore(flashcards): verification fixes" || echo "nothing to commit"
```

---

### Task 9: Generate the topic images (PAID — gated on explicit go-ahead)

**Files:**
- Create: `frontend/public/media/flashcards/topics/*.png`

> Do NOT run this without the user's explicit go-ahead. It spends real Gemini
> image quota. The feature already works without these images (placeholder
> fallback), so this is a separate, deliberate step.

- [ ] **Step 1: Generate candidates**

Run (with `GEMINI_API_KEY` set):
```bash
python tools/media/generate_flashcards_topics.py
```
Expected: ~31 `*.png` written to `frontend/public/media/flashcards/topics/`. Note any `WARN`/`ERROR` topics (vision throttling can drop a few).

- [ ] **Step 2: Review + re-roll weak ones**

Open the images. For any that are anatomically wrong, contain text/UI, or look off-brand, re-roll a single topic with extra candidates:
```bash
python tools/media/generate_flashcards_topics.py --only <topic_key> --count 4
```
Pick the best candidate, rename it to `<topic_key>.png` (drop the `-NN` suffix), delete the rest.

- [ ] **Step 3: Verify in the app**

Rebuild + serve (Task 5), open `/flashcards` step 2, confirm each card shows its photo (not the placeholder) and nothing is wrong-but-pretty.

- [ ] **Step 4: Commit the images**

```bash
git add frontend/public/media/flashcards/topics
git commit -m "assets(flashcards): per-topic fan-carousel images"
```

---

## Self-review

**Spec coverage:**
- Auto-rotating fan, click-to-start → Task 2 (auto-advance + `onPick`), Task 3 (`onStart`). ✅
- Mixed first card → Task 3 (`cards` array head). ✅
- Role access (OA/PSA vs OT) → unchanged; server-side; harness exercises CLINICAL. ✅
- Per-topic imagery, medically accurate, SNEC dress → Task 7 (`SUBJECTS`, `DRESS`). ✅
- Graceful placeholder fallback (ships without images) → Task 1 (`.is-placeholder`), Task 2 (`onError`). ✅
- Reduced-motion safe → Task 2 (`prefersReducedMotion`, `gsap.set`). ✅
- No study-loop / API-contract change → confirmed; only `StepTopic`/`SessionSetup`/CSS/harness touched. ✅
- Tests: harness + pure prompt-coverage → Task 4/6/7/8. ✅

**Placeholder scan:** No TBD/TODO; all code blocks are complete; `SUBJECTS` is fully populated for all 30 keys + `__mixed`.

**Type consistency:** `FanCard` (id/imgUrl/label/sub/hue/startable) is defined in Task 2 and consumed identically in Task 3. `topicImage()` defined+exported in Task 3, used only there. `build_prompt`/`SUBJECTS` defined in Task 7, imported by the Task 6 test. `data-testid` values (`flash-fan`, `flash-pick`, `flash-prev`) and `data-card-id` match between Task 2 and Task 4.
