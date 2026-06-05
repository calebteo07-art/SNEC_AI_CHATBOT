import { motion } from "motion/react";
import type { TopicNode, NodeState } from "../utils/curriculum";
import { springs } from "../utils/springs";
import { trackTokens } from "../utils/trackColors";
import { TopicIcon, LockIcon } from "../utils/topicIcons";

interface SkillNodeProps {
  topic: TopicNode;
  state: NodeState;
  stars: number;
  x: number;
  y: number;
  onClick: () => void;
  showStartBtn?: boolean;
  onStart?: () => void;
}

function Stars({ count }: { count: number }) {
  return (
    <div className="skill-node-stars">
      {[0, 1, 2].map(i => (
        <svg key={i} width="11" height="11" viewBox="0 0 14 14" fill="none">
          <polygon
            points="7,1.5 8.8,5.5 13,5.9 10,8.6 11,12.5 7,10.2 3,12.5 4,8.6 1,5.9 5.2,5.5"
            fill={i < count ? "#d97706" : "#e2e8f0"}
          />
        </svg>
      ))}
    </div>
  );
}

export function SkillNode({ topic, state, stars, x, y, onClick, showStartBtn, onStart }: SkillNodeProps) {
  const tokens = trackTokens(topic.track);
  const isLocked = state === "locked";
  const isActive = state === "active";
  const isDone   = state === "done";

  const circleStyle = isLocked
    ? {}
    : {
        background: tokens.gradient,
        borderBottom: `5px solid ${tokens.shadow}`,
        boxShadow: isActive
          ? `0 6px 0 ${tokens.shadow}, 0 0 0 8px ${tokens.bg}, 0 0 0 11px ${tokens.glow}`
          : `0 6px 0 ${tokens.shadow}, 0 10px 28px ${tokens.glow}`,
      };

  return (
    <div
      className={`skill-node-wrap${isLocked ? " locked" : ""}`}
      style={{ left: x, top: y }}
      onClick={isLocked ? undefined : onClick}
      role={isLocked ? undefined : "button"}
      aria-label={`${topic.label} — ${state}`}
      aria-disabled={isLocked}
    >
      <motion.div
        style={{ position: "relative" }}
        animate={isActive ? { y: [0, -5, 0] } : {}}
        transition={isActive ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" } : {}}
        whileHover={isLocked ? {} : { scale: 1.07, y: -3, transition: springs.snappy }}
        whileTap={isLocked ? {} : { scale: 0.95, y: 2, transition: { duration: 0.05 } }}
      >
        {/* Animated glow ring — active only */}
        {isActive && (
          <div
            className="skill-node-pulse"
            style={{ background: `radial-gradient(circle, ${tokens.glow} 0%, transparent 68%)` }}
          />
        )}

        <div
          className={`skill-node-circle ${state}`}
          style={circleStyle}
        >
          {!isLocked && <div className="skill-node-sheen" />}

          {isLocked && <LockIcon size={22} color="rgba(0,0,0,0.2)" />}
          {isDone && (
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M7 14.5L11.5 19L21 9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {isActive && <TopicIcon iconKey={topic.icon} size={26} />}
        </div>
      </motion.div>

      <Stars count={isLocked ? 0 : stars} />

      <span className={`skill-node-label ${state}`}>{topic.label}</span>

      {showStartBtn && isActive && (
        <motion.button
          className="start-lesson-btn"
          onClick={e => { e.stopPropagation(); onStart?.(); }}
          initial={{ opacity: 0, y: 6, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={springs.bouncy}
        >
          Start Lesson
        </motion.button>
      )}
    </div>
  );
}
