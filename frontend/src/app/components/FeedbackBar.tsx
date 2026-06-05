import { motion } from "motion/react";
import { feedbackBarVariant } from "../utils/springs";

interface FeedbackBarProps {
  correct: boolean;
  explanation: string;
  onContinue: () => void;
}

export function FeedbackBar({ correct, explanation, onContinue }: FeedbackBarProps) {
  return (
    <motion.div
      className={`feedback-bar ${correct ? "correct" : "wrong"}`}
      variants={feedbackBarVariant}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="feedback-content">
        <div className="feedback-label">
          {correct ? "Excellent!" : "Not quite"}
        </div>
        <div className="feedback-explanation">{explanation}</div>
      </div>
      <button className="feedback-continue-btn" onClick={onContinue}>
        Continue
      </button>
    </motion.div>
  );
}
