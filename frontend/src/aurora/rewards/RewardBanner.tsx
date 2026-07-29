"use client";
/* RewardBanner — the full-screen, in-your-face celebratory takeover. Portal to body at a
   high z-index, spring-in, confetti, image backdrop + optional medallion overlay. Auto-
   dismisses; tap anywhere or press Escape to continue. */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { confetti } from "@/fx/confetti";
import { Lumen } from "@/aurora/components/Lumen";
import { useReducedMotion } from "@/aurora/motion";
import type { Reward } from "./types";

const LABEL: Record<Reward["kind"], string> = {
  "achievement": "Achievement Unlocked",
  "lumen-badge": "New Lumens Badge",
  "level-up": "Level Up",
};

export function RewardBanner({ reward, onDone }: { reward: Reward; onDone: () => void }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    confetti({ particleCount: 170, spread: 105, startVelocity: 48, origin: { y: 0.35 },
      colors: ["#ffd21e", "#22bcff", "#2ee85a", "#ff7ab8", "#9b6bff"] });
    const t = setTimeout(onDone, 4200);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [reward.id, onDone]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div className="rw-scrim" data-testid="reward-banner" onClick={onDone}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="rw-card" data-kind={reward.kind} onClick={(e) => e.stopPropagation()}
        initial={reduce ? { opacity: 0 } : { scale: 0.7, y: 40, opacity: 0 }}
        animate={reduce ? { opacity: 1 } : { scale: 1, y: 0, opacity: 1 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", damping: 15, stiffness: 240 }}>
        <div className="rw-art" style={{ backgroundImage: `url(${reward.art})` }}>
          {reward.medal && (
            /* eslint-disable-next-line @next/next/no-img-element -- static asset, standalone build */
            <img className="rw-medal" src={reward.medal} alt="" width={140} height={140} />
          )}
        </div>
        <p className="rw-eyebrow">{LABEL[reward.kind]}</p>
        <h2 className="rw-title">{reward.title}</h2>
        <p className="rw-sub">{reward.subtitle}</p>
        {reward.lumens ? (
          <p className="rw-lumens"><Lumen size={22} decorative spark /> +{reward.lumens.toLocaleString()} Lumens</p>
        ) : null}
        <button type="button" className="rw-cta" onClick={onDone}>Tap to continue</button>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
