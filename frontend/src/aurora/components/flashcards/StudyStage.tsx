"use client";
/* StudyStage — the active-study layout: a slim top bar (deck title, progress dots,
   live XP), an adaptive coach line, the centered RecallCard, and a slim readout.
   Owns the keyboard-advance (Enter / → once graded). */
import { useEffect, useRef, useState } from "react";
import { type Flashcard, type AiFeedback, scoreTier } from "./types";
import { RecallCard } from "./RecallCard";

interface Props {
  card: Flashcard;
  idx: number;
  total: number;
  isRetry: boolean;
  deckTitle: string;
  submitted: boolean;
  aiChecking: boolean;
  aiFeedback: AiFeedback | null;
  cardXp: number;
  sessionXp: number;
  gradedCount: number;
  avgScore: number | null;
  userAttempt: string;
  setUserAttempt: (v: string) => void;
  onSubmit: () => void;
  onAdvance: () => void;
  onExplain: () => void;
  weakPending: boolean;
}

export function StudyStage(p: Props) {
  useEffect(() => {
    if (!p.submitted || p.aiChecking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); p.onAdvance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.submitted, p.aiChecking, p.onAdvance]);

  const [xpShown, setXpShown] = useState(p.sessionXp);
  const xpFromRef = useRef(p.sessionXp);
  useEffect(() => {
    const reduce = document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = xpFromRef.current;
    const to = p.sessionXp;
    xpFromRef.current = to;
    if (reduce || from === to) { setXpShown(to); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setXpShown(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p.sessionXp]);

  const remaining = Math.max(0, p.total - p.idx - 1);
  const coach = (() => {
    if (!p.submitted) return p.isRetry
      ? "↻ Round two — you've got this one now."
      : "Reach for it — even a rough answer wires it in.";
    if (p.aiChecking) return "Grading your answer…";
    const t = scoreTier(p.aiFeedback?.score ?? 60);
    if (t === "high") return `Crystal clear — +${p.cardXp} XP.`;
    if (t === "good") return `Solid — +${p.cardXp} XP. ${remaining} to go.`;
    if (t === "fair") return `Getting there — +${p.cardXp} XP.`;
    return `+${p.cardXp} XP for the reach — we'll bring this one back.`;
  })();

  const advanceLabel = p.idx < p.total - 1
    ? "Next card →"
    : (p.weakPending ? "Refocus weak cards →" : "Finish session →");

  return (
    <div className="flash-stage" data-testid="study-stage">
      <div className="flash-topbar">
        <span className="flash-deck-title">{p.deckTitle}</span>
        <span className="flash-dots" aria-label={`Card ${p.idx + 1} of ${p.total}`}>
          {Array.from({ length: p.total }).map((_, i) => (
            <i key={i} className={i < p.gradedCount ? "is-done" : i === p.idx ? "is-active" : ""} />
          ))}
        </span>
        <span className="flash-xp-live">{xpShown} XP</span>
      </div>

      <p className="flash-coach" key={coach}>{coach}</p>

      <RecallCard
        card={p.card}
        flipKey={`${p.idx}-${p.isRetry ? "r" : "n"}`}
        isRetry={p.isRetry}
        deckTitle={p.deckTitle}
        submitted={p.submitted}
        aiChecking={p.aiChecking}
        aiFeedback={p.aiFeedback}
        cardXp={p.cardXp}
        userAttempt={p.userAttempt}
        setUserAttempt={p.setUserAttempt}
        onSubmit={p.onSubmit}
        onAdvance={p.onAdvance}
        onExplain={p.onExplain}
        advanceLabel={advanceLabel}
      />

      <div className="flash-readout">
        <span>{p.idx + 1}/{p.total}</span>
        <span>{p.gradedCount} graded</span>
        {p.avgScore != null && <span>avg {p.avgScore}</span>}
      </div>
    </div>
  );
}
