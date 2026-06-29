"use client";
/* StudyStage — owns keyboard-advance (Enter / → once checked) and renders the McqCard
   instrument. Progress + question + readout all live inside the card now. */
import { useEffect } from "react";
import { type Flashcard } from "./types";
import { McqCard } from "./McqCard";

interface Props {
  card: Flashcard; idx: number; total: number; topicLabel: string; checked: boolean;
  reasonNote: string | null;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onReason: (cardId: number, stem: string, text: string, model: string) => void;
  onAdvance: () => void; advanceLabel: string;
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

  return (
    <div className="flash-stage" data-testid="study-stage">
      <McqCard card={p.card} topicLabel={p.topicLabel} idx={p.idx} total={p.total}
        onCheck={p.onCheck} onReason={p.onReason} onAdvance={p.onAdvance}
        advanceLabel={p.advanceLabel} reasonNote={p.reasonNote} />
    </div>
  );
}
