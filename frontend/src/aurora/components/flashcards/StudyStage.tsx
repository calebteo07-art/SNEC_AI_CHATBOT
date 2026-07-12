"use client";
/* StudyStage — thin frame around the McqCard instrument. The flip/charge/settle
   state lives inside McqCard; the deck-level combo streak is threaded through. */
import { type Flashcard } from "./types";
import { McqCard } from "./McqCard";

interface Props {
  card: Flashcard; idx: number; total: number; topicLabel: string; combo: number;
  /** Running score BEFORE this card (the HUD tick-up target on reveal). */
  score: number;
  reasonNote: string | null;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onReason: (cardId: number, stem: string, text: string, model: string) => void;
  onAdvance: () => void; advanceLabel: string;
  /** True while the pause overlay is up — threaded to McqCard to freeze its keyboard advance. */
  paused?: boolean;
}

export function StudyStage(p: Props) {
  return (
    <div className="flash-stage" data-testid="study-stage">
      {/* Key by card id so each card mounts FRESH on its front face. Without this the
          one persistent instrument reverse-flips on advance while its per-card reset
          clears the verdict → the back-face Payoff briefly shows "Review this" (jars
          most after a correct answer). A fresh mount has no prior flipped state. */}
      <McqCard key={p.card.id} card={p.card} topicLabel={p.topicLabel} idx={p.idx} total={p.total}
        combo={p.combo} score={p.score}
        onCheck={p.onCheck} onReason={p.onReason} onAdvance={p.onAdvance}
        advanceLabel={p.advanceLabel} reasonNote={p.reasonNote} paused={p.paused} />
    </div>
  );
}
