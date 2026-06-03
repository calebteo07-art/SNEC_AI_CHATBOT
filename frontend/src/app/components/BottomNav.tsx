// frontend/src/app/components/BottomNav.tsx
import React from "react";

export type NavTab = "learn" | "streak" | "league" | "profile";

interface BottomNavProps {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
  trackColor?: string;
}

const NAV_ITEMS: { tab: NavTab; label: string; Icon: React.FC<{ active: boolean; color: string }> }[] = [
  {
    tab: "learn",
    label: "Learn",
    Icon: ({ active, color }) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <path
          d="M3 10L10 3L17 10V17H13V13H7V17H3V10Z"
          fill={active ? color : "none"}
          stroke={active ? color : "rgba(255,255,255,0.3)"}
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    tab: "streak",
    label: "Streak",
    Icon: ({ active }) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 2C10 2 5.5 7 5.5 11C5.5 13.49 7.51 15.5 10 15.5C12.49 15.5 14.5 13.49 14.5 11C14.5 7 10 2 10 2Z"
          fill={active ? "#FF9600" : "none"}
          stroke={active ? "#FF9600" : "rgba(255,255,255,0.3)"}
          strokeWidth="1.5"
        />
        <path
          d="M10 9C10 9 8 11 8 12.5C8 13.33 8.67 14 9.5 14C9.5 14 9 13 10 12C11 13 10.5 14 10.5 14C11.33 14 12 13.33 12 12.5C12 11 10 9 10 9Z"
          fill={active ? "#FFD44A" : "none"}
        />
      </svg>
    ),
  },
  {
    tab: "league",
    label: "League",
    Icon: ({ active, color }) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 2.5L12.5 8H18L13.5 11.5L15.5 17L10 13.5L4.5 17L6.5 11.5L2 8H7.5L10 2.5Z"
          fill={active ? color : "none"}
          stroke={active ? color : "rgba(255,255,255,0.3)"}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    tab: "profile",
    label: "Profile",
    Icon: ({ active, color }) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <circle
          cx="10" cy="7" r="3.5"
          fill={active ? color : "none"}
          stroke={active ? color : "rgba(255,255,255,0.3)"}
          strokeWidth="1.5"
        />
        <path
          d="M3 17C3 14.24 6.13 12 10 12C13.87 12 17 14.24 17 17"
          stroke={active ? color : "rgba(255,255,255,0.3)"}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export function BottomNav({ active, onNavigate, trackColor = "#1CB0F6" }: BottomNavProps) {
  return (
    <div
      style={{
        background: "#080f16",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "8px 0 20px",
        display: "flex",
        justifyContent: "space-around",
        flexShrink: 0,
      }}
    >
      {NAV_ITEMS.map(({ tab, label, Icon }) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            onClick={() => onNavigate(tab)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px 12px",
              borderRadius: 10,
            }}
          >
            <Icon active={isActive} color={trackColor} />
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: isActive ? trackColor : "rgba(255,255,255,0.3)",
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
