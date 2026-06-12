import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import confetti from "canvas-confetti";
import { ACHIEVEMENTS } from "@/lib/legacy/gamification";

interface AchievementToastProps {
  achievementId: string;
  onClose: () => void;
}

export function AchievementToast({ achievementId, onClose }: AchievementToastProps) {
  const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);

  useEffect(() => {
    confetti({ particleCount: 50, spread: 55, origin: { y: 0.6 }, colors: ["#22c55e", "#16a34a", "#a78bfa", "#fbbf24"] });
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
      style={{ position: "fixed", top: 24, right: 24, zIndex: 50, maxWidth: 340 }}
    >
      <div style={{ background: "rgba(15,23,42,.92)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 20, padding: "16px 20px", boxShadow: "0 16px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(34,197,94,.1)", position: "relative" }}>
        {/* Green top shimmer */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg, transparent, #22c55e, transparent)", pointerEvents: "none" }} />

        <button
          onClick={onClose}
          aria-label="Dismiss"
          style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,.07)", border: "none", color: "var(--muted-text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <X size={12} strokeWidth={2} />
        </button>

        <p style={{ fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, color: "#22c55e", marginBottom: 10 }}>Achievement Unlocked</p>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <motion.div
            style={{ flexShrink: 0, width: 44, height: 44, borderRadius: "50%", background: "rgba(34,197,94,.12)", border: "1.5px solid rgba(34,197,94,.3)", display: "flex", alignItems: "center", justifyContent: "center" }}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <span style={{ fontSize: "1.3rem" }}>{achievement.icon}</span>
          </motion.div>

          <div style={{ flex: 1, minWidth: 0, paddingRight: 20 }}>
            <h4 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-.01em", marginBottom: 3 }}>
              {achievement.name}
            </h4>
            <p style={{ fontSize: "0.8rem", lineHeight: 1.5, color: "var(--muted-text)" }}>
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
          style={{ position: "fixed", top: `${24 + index * 130}px`, right: 24, zIndex: 50 }}
        >
          <AchievementToast achievementId={id} onClose={() => onDismiss(id)} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
