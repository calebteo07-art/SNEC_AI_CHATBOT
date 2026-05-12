import React from "react";
import { motion } from "motion/react";
import { getXPProgress, getXPForNextLevel } from "../utils/gamification";

interface XPBarProps {
  currentXP: number;
  level: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function XPBar({ currentXP, level, showLabel = true, size = "md" }: XPBarProps) {
  const progress = getXPProgress(currentXP);
  const nextLevelXP = getXPForNextLevel(currentXP);
  const currentLevelXP = (level - 1) * 500;
  const xpIntoLevel = currentXP - currentLevelXP;

  const heights = { sm: "h-[3px]", md: "h-[4px]", lg: "h-[5px]" };
  const textSizes = { sm: "0.7rem", md: "0.78rem", lg: "0.85rem" };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[#8C6D3F]"
            style={{
              fontSize: textSizes[size],
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Level {level}
          </span>
          <span
            className="text-[#A39A8E]"
            style={{ fontSize: textSizes[size], fontWeight: 400 }}
          >
            {xpIntoLevel} / {nextLevelXP - currentLevelXP} XP
          </span>
        </div>
      )}
      <div className={`w-full bg-[#1F1A12]/8 rounded-full overflow-hidden ${heights[size]} relative`}>
        <motion.div
          className="absolute inset-y-0 left-0 bg-[#8C6D3F] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
