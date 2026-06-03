// frontend/src/app/components/TrackTabs.tsx
import type { Track } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";

interface TrackTabsProps {
  active: Track;
  onChange: (track: Track) => void;
}

const TABS: Track[] = ["OA", "OT", "PSA"];

export function TrackTabs({ active, onChange }: TrackTabsProps) {
  return (
    <div style={{ display: "flex", gap: 6, padding: "0 0 16px" }}>
      {TABS.map((track) => {
        const tokens = trackTokens(track);
        const isActive = track === active;
        return (
          <button
            key={track}
            onClick={() => onChange(track)}
            style={{
              flex: 1,
              borderRadius: 10,
              padding: "7px 6px",
              textAlign: "center",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              border: `1px solid ${isActive ? tokens.primary : "rgba(255,255,255,0.08)"}`,
              background: isActive ? tokens.cardBg : "transparent",
              color: isActive ? tokens.primary : "rgba(255,255,255,0.3)",
              boxShadow: isActive ? `0 0 12px ${tokens.glow}` : "none",
              transition: "all 0.2s",
            }}
          >
            {track}
          </button>
        );
      })}
    </div>
  );
}
