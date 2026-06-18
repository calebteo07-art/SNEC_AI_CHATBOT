"use client";
/* RevealBack — the card's back face after grading. An oversized count-up score with
   score-driven color (via the --flash-score-hue custom property), the AI feedback,
   the student's answer set beside the model answer, and the actions. */
import { useCountUp } from "@/hooks/useCountUp";
import { type AiFeedback, scoreTier, scoreHue } from "./types";

interface Props {
  aiFeedback: AiFeedback | null;
  cardXp: number;
  userAttempt: string;
  modelAnswer: string;
  onExplain: () => void;
  onAdvance: () => void;
  advanceLabel: string;
}

export function RevealBack({
  aiFeedback, cardXp, userAttempt, modelAnswer, onExplain, onAdvance, advanceLabel,
}: Props) {
  const score = aiFeedback?.score ?? 0;
  const tier = scoreTier(score);
  const { ref: scoreRef, display } = useCountUp<HTMLSpanElement>(score, { duration: 1000 });

  return (
    <div className="flash-reveal" data-tier={tier}
      style={{ "--flash-score-hue": scoreHue(score) } as React.CSSProperties}>
      <div className="flash-scoreline">
        <span className="flash-score" data-testid="flash-score">
          <span ref={scoreRef}>{display}</span>{aiFeedback ? <i className="flash-score-max">/100</i> : null}
        </span>
        <span className="flash-xp">+{cardXp} XP</span>
      </div>

      <p className="flash-feedback">
        {aiFeedback ? aiFeedback.feedback : "Graded offline — compare with the model answer below."}
      </p>

      <div className="flash-compare">
        <div className="flash-compare-col is-yours">
          <span className="flash-compare-label">Your answer</span>
          <p>{userAttempt.trim() ? userAttempt : <em>(left blank)</em>}</p>
        </div>
        <div className="flash-compare-col is-model">
          <span className="flash-compare-label">Model answer</span>
          <p>{modelAnswer}</p>
        </div>
      </div>

      <div className="flash-reveal-actions">
        <button type="button" className="flash-tutor flash-press" onClick={onExplain}>
          🎓 Explain this in the Tutor
        </button>
        <button type="button" className="flash-advance flash-press" data-testid="flash-advance" onClick={onAdvance}>
          {advanceLabel}
        </button>
      </div>
    </div>
  );
}
