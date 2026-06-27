"use client";
/* StudyStage — active-study layout: a slim top bar (deck title, progress dots), a short
   coach line, the centered McqCard, and a slim readout (no running score — that's end-only).
   Owns keyboard-advance (Enter / → once the card is checked). */
import { useEffect } from "react";
import { type Flashcard } from "./types";
import { McqCard } from "./McqCard";

interface Props {
  card: Flashcard;
  idx: number;
  total: number;
  deckTitle: string;
  checked: boolean;
  reasonNote: string | null;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onAdvance: () => void;
  advanceLabel: string;
}

export function StudyStage(p: Props) {
  useEffect(() => {
    if (!p.checked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); p.onAdvance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.checked, p.onAdvance]);

  const remaining = Math.max(0, p.total - p.idx - 1);
  const coach = p.checked
    ? (remaining > 0 ? `${remaining} to go.` : "Last one — nice work.")
    : (p.card.freeText
        ? "Recall it, then reveal the answer."
        : p.card.qtype === "multi" ? "Select every option that applies." : "Pick the best answer.");

  return (
    <div className="flash-stage" data-testid="study-stage">
      <div className="flash-topbar">
        <span className="flash-deck-title">{p.deckTitle}</span>
        <span className="flash-dots" aria-label={`Card ${p.idx + 1} of ${p.total}`}>
          {Array.from({ length: p.total }).map((_, i) => (
            <i key={i} className={i < p.idx ? "is-done" : i === p.idx ? "is-active" : ""} />
          ))}
        </span>
        <span className="flash-readout-n">{p.idx + 1}/{p.total}</span>
      </div>

      <p className="flash-coach" key={coach}>{coach}</p>

      <McqCard
        card={p.card}
        deckTitle={p.deckTitle}
        onCheck={p.onCheck}
        onAdvance={p.onAdvance}
        advanceLabel={p.advanceLabel}
        reasonNote={p.reasonNote}
      />
    </div>
  );
}
