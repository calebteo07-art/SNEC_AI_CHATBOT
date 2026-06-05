import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { tooltipVariant } from "../utils/springs";
import type { TopicNode, NodeState } from "../utils/curriculum";
import { trackTokens, topicHeroImage } from "../utils/trackColors";
import { TopicIcon } from "../utils/topicIcons";

interface NodeTooltipProps {
  topic: TopicNode | null;
  state: NodeState;
  stars: number;
  onClose: () => void;
  onLearn:    (topicId: string) => void;
  onSimulate: (topicId: string) => void;
  onChat:     (topicId: string) => void;
}

export function NodeTooltip({ topic, state, stars, onClose, onLearn, onSimulate, onChat }: NodeTooltipProps) {
  return (
    <AnimatePresence>
      {topic && (
        <motion.div
          className="node-tooltip"
          variants={tooltipVariant}
          initial="hidden"
          animate="visible"
          exit="exit"
          aria-label={`${topic.label} lesson options`}
          role="dialog"
        >
          {/* Hero image */}
          <div className="tooltip-hero">
            <img
              src={topicHeroImage(topic.id)}
              alt={topic.label}
              loading="lazy"
            />
            <div className="tooltip-hero-overlay">
              <TrackBadge topic={topic} />
              <h3 className="tooltip-topic-title">{topic.label}</h3>
              {state === "done" && (
                <div className="tooltip-stars">
                  {[0, 1, 2].map(i => (
                    <svg key={i} width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <polygon
                        points="7,1.5 8.8,5.5 13,5.9 10,8.6 11,12.5 7,10.2 3,12.5 4,8.6 1,5.9 5.2,5.5"
                        fill={i < stars ? "#fbbf24" : "rgba(255,255,255,0.2)"}
                      />
                    </svg>
                  ))}
                </div>
              )}
            </div>
            <button className="tooltip-close" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {/* Body */}
          <div className="tooltip-body">
            <p className="tooltip-desc">{topic.description}</p>
            <div className="tooltip-actions">
              <ActionBtn
                className="primary"
                icon={<FlashcardSvg />}
                iconBg={trackTokens(topic.track).gradient}
                label="Flashcards"
                sub={`Study ${topic.label} terms`}
                onClick={() => onLearn(topic.id)}
              />
              <ActionBtn
                icon={<CaseSvg />}
                iconBg="rgba(124,58,237,0.12)"
                label="Case Simulation"
                sub="Practice clinical scenarios"
                onClick={() => onSimulate(topic.id)}
              />
              <ActionBtn
                icon={<ChatSvg />}
                iconBg="rgba(8,145,178,0.12)"
                label="Ask AI Tutor"
                sub="Socratic dialogue"
                onClick={() => onChat(topic.id)}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TrackBadge({ topic }: { topic: TopicNode }) {
  const tokens = trackTokens(topic.track);
  return (
    <div
      className="tooltip-track-badge"
      style={{ color: tokens.primary }}
    >
      <TopicIcon iconKey={topic.icon} size={10} color={tokens.primary} />
      {topic.track === "core" ? "Core" : `${topic.track} Track`}
    </div>
  );
}

function ActionBtn({
  icon, iconBg, label, sub, onClick, className = "",
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sub: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      className={`tooltip-action-btn ${className}`}
      onClick={onClick}
    >
      <div className="tooltip-action-icon" style={{ background: iconBg }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 1 }}>{sub}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
        <path d="M4 7H10M10 7L7 4M10 7L7 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function FlashcardSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="4" width="14" height="10" rx="1.5" stroke="#fff" strokeWidth="1.4" />
      <line x1="5" y1="8" x2="13" y2="8" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="11" x2="10" y2="11" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CaseSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="6" stroke="#7c3aed" strokeWidth="1.4" />
      <path d="M6 9C6 9 7.2 7 9 7C10.8 7 12 9 12 9C12 9 10.8 11 9 11C7.2 11 6 9 6 9Z" stroke="#7c3aed" strokeWidth="1.2" fill="none" />
      <circle cx="9" cy="9" r="1.5" fill="#7c3aed" />
    </svg>
  );
}

function ChatSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M3 4H15C15.55 4 16 4.45 16 5V12C16 12.55 15.55 13 15 13H6L3 16V5C3 4.45 3.45 4 4 4H3Z" stroke="#0891b2" strokeWidth="1.4" fill="none" />
      <circle cx="7"  cy="8.5" r="1" fill="#0891b2" />
      <circle cx="9"  cy="8.5" r="1" fill="#0891b2" />
      <circle cx="11" cy="8.5" r="1" fill="#0891b2" />
    </svg>
  );
}

