// frontend/src/app/components/NodePopup.tsx
import React from "react";
import { motion, AnimatePresence } from "motion/react";
import type { TopicNode } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";
import { TopicIcon } from "../utils/topicIcons";

interface NodePopupProps {
  topic: TopicNode | null;
  stars: number;
  onClose: () => void;
  onLearn: (topicId: string) => void;
  onSimulate: (topicId: string) => void;
  onChat: (topicId: string) => void;
}

function ActionButton({
  icon,
  title,
  subtitle,
  bg,
  border,
  iconBg,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  bg: string;
  border: string;
  iconBg: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        borderRadius: 14,
        padding: "14px 16px",
        border: `1px solid ${border}`,
        background: bg,
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{title}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 18 }}>›</div>
    </motion.button>
  );
}

export function NodePopup({ topic, stars, onClose, onLearn, onSimulate, onChat }: NodePopupProps) {
  return (
    <AnimatePresence>
      {topic && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(6px)",
              zIndex: 40,
            }}
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              background: "linear-gradient(180deg, #0f1e30 0%, #0c1828 100%)",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              border: `1px solid ${trackTokens(topic.track).cardBorder}`,
              padding: "20px 20px 40px",
              boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
            }}
          >
            {/* Handle */}
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: "rgba(255,255,255,0.12)",
                margin: "0 auto 18px",
              }}
            />

            {/* Node info */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: trackTokens(topic.track).gradient,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: `0 5px 0 ${trackTokens(topic.track).shadow}, 0 8px 24px ${trackTokens(topic.track).glow}`,
                }}
              >
                <TopicIcon iconKey={topic.icon} size={26} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{topic.label}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                  {topic.track === "core" ? "Shared Core" : `${topic.track} Track`} · {topic.description}
                </div>
              </div>
            </div>

            {/* Stars */}
            <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
              {[0, 1, 2].map((i) => (
                <svg key={i} width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <polygon
                    points="7,1.5 8.8,5.5 13,5.9 10,8.6 11,12.5 7,10.2 3,12.5 4,8.6 1,5.9 5.2,5.5"
                    fill={i < stars ? "#FFD700" : "rgba(255,255,255,0.1)"}
                  />
                </svg>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ActionButton
                title="Flashcards"
                subtitle={`Review ${topic.label} terms`}
                bg="rgba(88,204,2,0.08)"
                border="rgba(88,204,2,0.2)"
                iconBg="linear-gradient(135deg,#58CC02,#3EA000)"
                onClick={() => onLearn(topic.id)}
                icon={
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <rect x="3" y="5" width="14" height="11" rx="2" stroke="#fff" strokeWidth="1.6" />
                    <line x1="6" y1="9" x2="14" y2="9" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                    <line x1="6" y1="12" x2="11" y2="12" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                }
              />
              <ActionButton
                title="Case Simulation"
                subtitle={`Practise ${topic.label} scenarios`}
                bg="rgba(28,176,246,0.08)"
                border="rgba(28,176,246,0.2)"
                iconBg="linear-gradient(135deg,#1CB0F6,#0090DD)"
                onClick={() => onSimulate(topic.id)}
                icon={
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="7" stroke="#fff" strokeWidth="1.6" />
                    <path d="M7 10C7 10 8.5 8 10 8C11.5 8 13 10 13 10C13 10 11.5 12 10 12C8.5 12 7 10 7 10Z" stroke="#fff" strokeWidth="1.4" fill="none" />
                    <circle cx="10" cy="10" r="1.5" fill="#fff" />
                  </svg>
                }
              />
              <ActionButton
                title="Ask Tutor"
                subtitle={`Socratic dialogue on ${topic.label}`}
                bg="rgba(180,80,255,0.08)"
                border="rgba(180,80,255,0.18)"
                iconBg="linear-gradient(135deg,#B44FFF,#8A30CC)"
                onClick={() => onChat(topic.id)}
                icon={
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M3 4H17C17.55 4 18 4.45 18 5V13C18 13.55 17.55 14 17 14H7L3 17V5C3 4.45 3.45 4 4 4H3Z" stroke="#fff" strokeWidth="1.6" fill="none" />
                  </svg>
                }
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
