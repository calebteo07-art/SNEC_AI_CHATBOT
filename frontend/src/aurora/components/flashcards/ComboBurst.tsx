"use client";
/* ComboBurst — the loud gamification callout (ricoe B3). When a correct answer levels
   up the streak, a big game-phrased word ("DOUBLE UP", "ON FIRE", "UNSTOPPABLE") slams
   in over the study stage with a shockwave ring and the ×N multiplier, holds, then
   fades. Fixed + pointer-events:none, so it never blocks the card underneath. It
   self-dismisses; the caller keys it so each new streak restarts the animation. */
import { useEffect, useRef } from "react";
import { comboMultiplier, comboCallout } from "./types";

const HOLD_MS = 1250; // on-screen dwell before the caller unmounts it

export function ComboBurst({ combo, onDone }: { combo: number; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  // Run the dismiss timer exactly once per mount — a parent re-render (combo/state
  // churn) must not restart the beat, so onDone is read from a ref, not the deps.
  useEffect(() => {
    const t = window.setTimeout(() => done.current(), HOLD_MS);
    return () => window.clearTimeout(t);
  }, []);

  const call = comboCallout(combo);
  if (!call) return null; // below the first multiplier tier — nothing to celebrate
  const mult = comboMultiplier(combo);

  return (
    <div className="flash-burst" data-testid="flash-burst" role="status" aria-live="polite">
      <span className="flash-burst-ring" aria-hidden />
      <span className="flash-burst-ring is-2" aria-hidden />
      <span className="flash-burst-mult">×{mult}</span>
      <span className="flash-burst-word">{call.word}</span>
      <span className="flash-burst-sub">{call.sub} · combo</span>
    </div>
  );
}
