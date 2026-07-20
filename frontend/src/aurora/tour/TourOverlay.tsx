"use client";
/* Presentational tour overlay: scrim + spotlight + Eyecon-narrated tooltip card, with
   keyboard/focus/a11y. Anchors resolve via useTourAnchor; a missing anchor degrades to a
   centered card. Portal to <body>, z in the fx.css GuidedTour band. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { confetti } from "@/fx/confetti";
import { useAvatar } from "@/hooks/useAvatar";
import { useReducedMotion } from "@/aurora/motion";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { waitForElement, useAnchorRect } from "./useTourAnchor";
import type { TourStep } from "./tourSteps";

const CARD_W = 360;
const CARD_H = 200;
const PAD = 10;   // spotlight padding around the anchor
const GAP = 16;   // gap between spotlight and card / viewport edges

export function TourOverlay({
  steps, index, onNext, onEnd,
}: {
  steps: TourStep[];
  index: number;
  onNext: () => void;
  onEnd: () => void;
}) {
  const step = steps[index];
  const total = steps.length;
  const last = index === total - 1;
  const reduce = useReducedMotion();
  const { data: avatar } = useAvatar();
  const cardRef = useRef<HTMLDivElement>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  /* Resolve this step's anchor, waiting for route/animation transitions. Null target or a
     timeout ⇒ centered card. Keyed on step.id so it re-runs each step. */
  useEffect(() => {
    let cancelled = false;
    setAnchorEl(null);
    if (!step.target) return;
    const selectors = step.fallback ? [step.target, step.fallback] : [step.target];
    waitForElement(selectors, step.waitMs ?? 4000).then((el) => {
      if (cancelled || !el) return;
      el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      setAnchorEl(el);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  const rect = useAnchorRect(anchorEl);

  /* Move focus into the card each step (a11y). */
  useEffect(() => { cardRef.current?.focus(); }, [step.id]);

  /* Keyboard: Enter/→/Space advance; Escape is the assistive-tech escape; Tab trapped to card. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); onNext(); }
      else if (e.key === "Escape") { e.preventDefault(); onEnd(); }
      else if (e.key === "Tab") { e.preventDefault(); cardRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onEnd]);

  /* Confetti finale. */
  useEffect(() => {
    if (!step.confetti) return;
    confetti({ particleCount: 170, spread: 105, startVelocity: 48, origin: { y: 0.4 },
      colors: ["#3C90FF", "#AD72FF", "#F96BD6", "#FFCF03", "#60D673"] });
  }, [step.id, step.confetti]);

  if (typeof document === "undefined") return null;

  const spot = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;
  const centered = !spot;

  /* Card placement: below the spotlight if it fits, else above; clamp to viewport. Centered
     when there's no anchor. */
  let cardStyle: CSSProperties;
  if (centered) {
    cardStyle = { top: `calc(50% - ${CARD_H / 2}px)`, left: `calc(50% - ${CARD_W / 2}px)` };
  } else {
    const below = spot!.top + spot!.height + GAP;
    const above = spot!.top - GAP - CARD_H;
    const top = below + CARD_H < window.innerHeight ? below : Math.max(GAP, above);
    let left = spot!.left + spot!.width / 2 - CARD_W / 2;
    left = Math.max(GAP, Math.min(left, window.innerWidth - CARD_W - GAP));
    cardStyle = { top, left };
  }

  return createPortal(
    <div className={`tour-scrim${centered ? " tour-scrim--center" : ""}`} data-testid="tour" data-step={step.id}>
      {spot && <div className="tour-spot" style={spot} aria-hidden />}
      <motion.div
        ref={cardRef}
        className="tour-card"
        style={cardStyle}
        role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        tabIndex={-1}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 8 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", damping: 18, stiffness: 260 }}
      >
        <div className="tour-head">
          <Eyecon config={avatar?.config} size={40} />
          <div>
            <div className="tour-name">Eyecon</div>
            <div className="tour-role">your guide</div>
          </div>
        </div>
        <h2 id="tour-title" className="tour-title">{step.title}</h2>
        <p id="tour-body" className="tour-body">{step.body}</p>
        <div className="tour-foot">
          <div className="tour-dots" aria-hidden>
            {steps.map((s, i) => <i key={s.id} className={i === index ? "on" : ""} />)}
          </div>
          <span className="sr-only" aria-live="polite">Step {index + 1} of {total}</span>
          <button type="button" className="tour-next" onClick={onNext} data-testid="tour-next">
            {last ? "Let's go!" : "Next →"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
