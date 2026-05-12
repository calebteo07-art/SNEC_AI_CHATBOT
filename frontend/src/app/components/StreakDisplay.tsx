import React from "react";
import { motion } from "motion/react";
import { Flame } from "lucide-react";

interface StreakDisplayProps {
  streak: number;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
}

export function StreakDisplay({ streak, size = "md", animated = true }: StreakDisplayProps) {
  const iconSizes = { sm: 12, md: 14, lg: 18 };
  const textSizes = { sm: "0.78rem", md: "0.88rem", lg: "0.95rem" };
  const paddingSizes = { sm: "px-2.5 py-1", md: "px-3 py-1.5", lg: "px-4 py-2" };

  return (
    <motion.div
      className={`inline-flex items-center gap-1.5 rounded-full ${paddingSizes[size]}`}
      style={{
        background: "rgba(140, 109, 63, 0.08)",
        border: "1px solid rgba(140, 109, 63, 0.22)",
      }}
      whileHover={animated ? { scale: 1.03 } : undefined}
    >
      <Flame
        size={iconSizes[size]}
        strokeWidth={1.5}
        className="text-[#8C6D3F]"
      />
      <span
        style={{ color: "#8C6D3F", fontSize: textSizes[size], fontWeight: 500 }}
      >
        {streak}
      </span>
      <span
        className="text-[#8C6D3F]/70"
        style={{ fontSize: textSizes[size], fontWeight: 400 }}
      >
        {streak === 1 ? "day" : "days"}
      </span>
    </motion.div>
  );
}
