import React, { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Trophy, X, Zap } from "lucide-react";
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
      particleCount: 80,
      spread: 60,
      origin: { y: 0.6 },
      colors: ["#00E5FF", "#39FF14", "#FFB300", "#F0F9FF"],
    });

    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!achievement) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -100, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.9 }}
      transition={{ type: "spring", damping: 15, stiffness: 300 }}
      className="fixed top-6 right-6 z-50 max-w-sm"
    >
      <div className="relative glass-panel border-[#FFB300]/40 rounded-2xl overflow-hidden hud-corners shadow-[0_0_40px_rgba(255,179,0,0.25)]">
        {/* Top status strip */}
        <div className="h-1 bg-gradient-to-r from-transparent via-[#FFB300] to-transparent" />

        {/* Animated rim sweep */}
        <motion.div
          className="absolute inset-x-0 top-1 h-px"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #FFB300 50%, transparent 100%)",
          }}
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
        />

        <div className="p-5 relative">
          {/* HUD micro-label */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={11} className="text-[#FFB300] fill-[#FFB300]" />
              <span className="text-[#FFB300] font-mono text-[0.55rem] uppercase tracking-[0.35em]">
                Protocol_Unlocked
              </span>
              <span className="w-1 h-1 rounded-full bg-[#FFB300] hud-blink" />
            </div>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-[#FF3D00] transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex items-start gap-4">
            {/* Icon node */}
            <motion.div
              className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center relative"
              style={{
                background: "radial-gradient(circle, rgba(255,179,0,0.25) 0%, rgba(0,0,0,0.4) 70%)",
                border: "1px solid rgba(255,179,0,0.4)",
                boxShadow: "0 0 20px rgba(255,179,0,0.3), inset 0 0 12px rgba(255,179,0,0.15)",
              }}
              animate={{
                rotate: [0, -6, 6, -6, 0],
                scale: [1, 1.08, 1],
              }}
              transition={{ duration: 0.7, ease: "easeInOut" }}
            >
              <span className="text-2xl relative z-10">{achievement.icon}</span>
              <motion.div
                className="absolute inset-0 rounded-xl border border-[#FFB300]/60"
                animate={{ scale: [1, 1.25], opacity: [0.6, 0] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
            </motion.div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Trophy size={11} className="text-[#FFB300]" />
                <span className="text-white/40 font-mono text-[0.55rem] uppercase tracking-widest">
                  Achievement
                </span>
              </div>
              <h4
                className="text-[#FFB300] font-black uppercase tracking-tight mb-1 glow-text-amber"
                style={{ fontFamily: "var(--font-display)", fontSize: "0.95rem" }}
              >
                {achievement.name}
              </h4>
              <p
                className="text-white/70"
                style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", lineHeight: 1.55 }}
              >
                {achievement.description}
              </p>
            </div>
          </div>

          {/* Footer status line */}
          <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center">
            <span className="text-white/20 font-mono text-[0.5rem] uppercase tracking-[0.3em]">
              Sync_Complete
            </span>
            <div className="flex gap-1">
              <span className="w-1 h-1 rounded-full bg-[#39FF14]" />
              <span className="w-1 h-1 rounded-full bg-[#39FF14]/60" />
              <span className="w-1 h-1 rounded-full bg-[#39FF14]/30" />
            </div>
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
          style={{ top: `${24 + index * 160}px` }}
          className="fixed right-6 z-50"
        >
          <AchievementToast achievementId={id} onClose={() => onDismiss(id)} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
