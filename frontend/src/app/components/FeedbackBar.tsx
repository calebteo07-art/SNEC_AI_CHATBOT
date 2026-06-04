import { motion } from "motion/react";

interface FeedbackBarProps {
  correct: boolean;
  explanation: string;
  onContinue: () => void;
}

export function FeedbackBar({ correct, explanation, onContinue }: FeedbackBarProps) {
  return (
    <motion.div
      className={`feedback-bar ${correct ? "correct" : "wrong"}`}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 26, stiffness: 300 }}
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
