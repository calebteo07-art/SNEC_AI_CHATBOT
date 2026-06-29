"use client";
/* StudyStage — thin frame around the McqCard instrument. Keyboard-advance and the
   dwell gate now live inside McqCard (it owns reveal/dwell state). Progress + question
   + readout all live inside the card. */
import { type Flashcard } from "./types";
import { McqCard } from "./McqCard";

interface Props {
  card: Flashcard; idx: number; total: number; topicLabel: string;
  reasonNote: string | null;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onReason: (cardId: number, stem: string, text: string, model: string) => void;
  onAdvance: () => void; advanceLabel: string;
}

export function StudyStage(p: Props) {
  return (
    <div className="flash-stage" data-testid="study-stage">
      <McqCard card={p.card} topicLabel={p.topicLabel} idx={p.idx} total={p.total}
        onCheck={p.onCheck} onReason={p.onReason} onAdvance={p.onAdvance}
        advanceLabel={p.advanceLabel} reasonNote={p.reasonNote} />
    </div>
  );
}
