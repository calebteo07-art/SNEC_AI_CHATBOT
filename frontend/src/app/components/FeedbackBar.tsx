import { AnimatePresence, motion } from "motion/react";
import { feedbackBarVariant } from "../utils/springs";

interface FeedbackBarProps {
  visible: boolean;
  correct: boolean;
  explanation: string;
  onContinue: () => void;
}

export function FeedbackBar({ visible, correct, explanation, onContinue }: FeedbackBarProps) {
  return (
    <AnimatePresence>
      {visible && (
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
      )}
    </AnimatePresence>
  );
}
