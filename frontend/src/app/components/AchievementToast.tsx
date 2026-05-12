import React, { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import confetti from "canvas-confetti";
import { ACHIEVEMENTS } from "../utils/gamification";

interface AchievementToastProps {
  achievementId: string;
  onClose: () => void;
}

export function AchievementToast({ achievementId, onClose }: AchievementToastProps) {
  const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);

  useEffect(() => {
    confetti({
      particleCount: 40,
      spread: 50,
      origin: { y: 0.65 },
      colors: ["#8C6D3F", "#C4A57B", "#4F6B3D", "#1F1A12"],
    });

    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!achievement) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.96 }}
      transition={{ type: "spring", damping: 18, stiffness: 280 }}
      className="fixed top-6 right-6 z-50 max-w-sm"
    >
      <div
        className="surface-card-lg p-5 relative"
        style={{ boxShadow: "0 1px 2px rgba(31,26,18,0.04), 0 16px 48px rgba(31,26,18,0.08)" }}
      >
        {/* Hairline bronze rule on top */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#8C6D3F]/60 to-transparent" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#A39A8E] hover:text-[#1F1A12] transition-colors"
        >
          <X size={14} strokeWidth={1.5} />
        </button>

        {/* Label */}
        <p
          className="text-[#8C6D3F] mb-3"
          style={{ fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
        >
          · Earned
        </p>

        <div className="flex items-start gap-4">
          <motion.div
            className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(140, 109, 63, 0.08)",
              border: "1px solid rgba(140, 109, 63, 0.2)",
            }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <span className="text-xl">{achievement.icon}</span>
          </motion.div>

          <div className="flex-1 min-w-0 pr-4">
            <h4
              className="text-[#1F1A12] mb-1"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.05rem",
                fontWeight: 400,
                letterSpacing: "-0.005em",
              }}
            >
              {achievement.name}
            </h4>
            <p
              className="text-[#5C544A]"
              style={{ fontSize: "0.82rem", lineHeight: 1.5 }}
            >
              {achievement.description}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface AchievementManagerProps {
  achievements: string[];
  onDismiss: (id: string) => void;
}

export function AchievementManager({ achievements, onDismiss }: AchievementManagerProps) {
  return (
    <AnimatePresence mode="popLayout">
      {achievements.map((id, index) => (
        <motion.div
          key={id}
          style={{ top: `${24 + index * 130}px` }}
          className="fixed right-6 z-50"
        >
          <AchievementToast achievementId={id} onClose={() => onDismiss(id)} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
