// frontend/src/app/components/SkillNode.tsx
import React from "react";
import { motion } from "motion/react";
import type { TopicNode, NodeState } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";
import { TopicIcon } from "../utils/topicIcons";
import { LockIcon } from "../utils/topicIcons";

interface SkillNodeProps {
  topic: TopicNode;
  state: NodeState;
  stars: number; // 0–3
  onClick: () => void;
}

function StarRating({ stars }: { stars: number }) {
  return (
    <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
      {[0, 1, 2].map((i) => (
        <svg key={i} width="10" height="10" viewBox="0 0 10 10" fill="none">
          <polygon
            points="5,1 6.2,3.8 9.5,4.1 7.2,6.2 7.9,9.5 5,7.8 2.1,9.5 2.8,6.2 0.5,4.1 3.8,3.8"
            fill={i < stars ? "#FFD700" : "rgba(255,255,255,0.1)"}
          />
        </svg>
      ))}
    </div>
  );
}

export function SkillNode({ topic, state, stars, onClick }: SkillNodeProps) {
  const tokens = trackTokens(topic.track);
  const isLocked = state === "locked";
  const isActive = state === "active";

  const bodyStyle: React.CSSProperties = isLocked
    ? {
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.06)",
        border: "2px solid rgba(255,255,255,0.09)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "not-allowed",
        position: "relative",
        overflow: "hidden",
      }
    : {
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: tokens.gradient,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        boxShadow: `0 6px 0 ${tokens.shadow}, 0 8px 24px ${tokens.glow}`,
      };

  return (
    <motion.div
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
      whileHover={isLocked ? {} : { scale: 1.06 }}
      whileTap={isLocked ? {} : { scale: 0.95 }}
      onClick={isLocked ? undefined : onClick}
    >
      <motion.div
        style={{ position: "relative" }}
        animate={isActive ? { y: [0, -4, 0] } : {}}
        transition={isActive ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" } : {}}
      >
        {/* Glow pulse ring for active node */}
        {isActive && (
          <motion.div
            style={{
              position: "absolute",
              inset: -6,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${tokens.glow} 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
            animate={{ opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}

        <div style={bodyStyle}>
          {/* Highlight sheen */}
          {!isLocked && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%)",
                pointerEvents: "none",
              }}
            />
          )}
          {isLocked
            ? <LockIcon size={22} opacity={0.25} />
            : <TopicIcon iconKey={topic.icon} size={26} />
          }
        </div>

        {/* 3D shadow bar */}
        {!isLocked && (
          <div
            style={{
              position: "absolute",
              bottom: -4,
              left: "50%",
              transform: "translateX(-50%)",
              width: 48,
              height: 5,
              background: tokens.shadow,
              borderRadius: "50%",
            }}
          />
        )}
      </motion.div>

      <StarRating stars={isLocked ? 0 : stars} />

      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textAlign: "center",
          maxWidth: 72,
          lineHeight: 1.2,
          color: isLocked ? "rgba(255,255,255,0.2)" : tokens.primary,
        }}
      >
        {topic.label}
      </div>
    </motion.div>
  );
}
