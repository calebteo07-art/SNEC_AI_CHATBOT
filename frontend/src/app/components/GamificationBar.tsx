// frontend/src/app/components/GamificationBar.tsx
import React from "react";

interface GamificationBarProps {
  streak: number;
  xp: number;
  hearts: number;
  league?: string;
}

function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 1C8 1 4 5.5 4 9C4 11.21 5.79 13 8 13C10.21 13 12 11.21 12 9C12 5.5 8 1 8 1Z" fill="#FF9600" />
      <path d="M8 7C8 7 6 9 6 10.5C6 11.33 6.67 12 7.5 12C7.5 12 7 11 8 10C9 11 8.5 12 8.5 12C9.33 12 10 11.33 10 10.5C10 9 8 7 8 7Z" fill="#FFD44A" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 10 10" fill="none">
      <polygon points="5,1 6.2,3.8 9.5,4.1 7.2,6.2 7.9,9.5 5,7.8 2.1,9.5 2.8,6.2 0.5,4.1 3.8,3.8" fill="#72E010" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 13C8 13 2 9 2 5.5C2 3.57 3.57 2 5.5 2C6.61 2 7.6 2.52 8 3.36C8.4 2.52 9.39 2 10.5 2C12.43 2 14 3.57 14 5.5C14 9 8 13 8 13Z" fill="#FF4B4B" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L10 6H14L11 9L12 13L8 10.5L4 13L5 9L2 6H6L8 2Z" fill="none" stroke="#4DC8FF" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="2" fill="#4DC8FF" opacity={0.6} />
    </svg>
  );
}

export function GamificationBar({ streak, xp, hearts, league = "Silver" }: GamificationBarProps) {
  const pillStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 999,
    padding: "4px 11px",
    fontSize: 12,
    fontWeight: 700,
  };

  return (
    <div
      style={{
        background: "#0a1520",
        padding: "10px 16px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ ...pillStyle, color: "#FFAA20" }}>
        <FlameIcon />
        {streak}
      </div>
      <div style={{ ...pillStyle, color: "#72E010" }}>
        <StarIcon />
        {xp} XP
      </div>
      <div style={{ ...pillStyle, color: "#FF6060" }}>
        <HeartIcon />
        {hearts}
      </div>
      <div
        style={{
          marginLeft: "auto",
          background: "linear-gradient(135deg, rgba(28,176,246,0.15), rgba(0,120,200,0.08))",
          border: "1px solid rgba(28,176,246,0.3)",
          borderRadius: 10,
          padding: "4px 10px",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#4DC8FF",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <TrophyIcon />
        {league}
      </div>
    </div>
  );
}
