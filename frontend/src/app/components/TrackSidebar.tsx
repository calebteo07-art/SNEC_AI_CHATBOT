import type { Track } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";

interface TrackSidebarProps {
  activeTrack: Track;
  onTrackChange: (t: Track) => void;
  weekHits: boolean[];     // 7 booleans, Mon–Sun, today = index 6
  sessionCount: number;
  avgScore: number;        // 0–100
}

const TRACKS: Track[] = ["OA", "OT", "PSA"];
const TRACK_LABELS: Record<Track, string> = { OA: "Ophthalmic Assistant", OT: "Ophthalmic Technician", PSA: "Patient Service Associate" };
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function TrackSidebar({ activeTrack, onTrackChange, weekHits, sessionCount, avgScore }: TrackSidebarProps) {
  return (
    <aside className="track-sidebar" aria-label="Training tracks">
      {/* Eyeline banner */}
      <div className="track-sidebar-banner">
        <img src="/anatomy/clinic-slitlamp.png" alt="SNEC clinic" />
        <div className="track-sidebar-banner-overlay">
          <span className="track-banner-label">SNEC Clinical Training</span>
        </div>
      </div>

      <div className="track-sidebar-body">
        <p className="section-label">Your Tracks</p>

        {TRACKS.map(track => {
          const tokens = trackTokens(track);
          const isActive = track === activeTrack;
          return (
            <button
              key={track}
              className={`track-btn${isActive ? ` active-${track.toLowerCase()}` : ""}`}
              onClick={() => onTrackChange(track)}
              aria-pressed={isActive}
            >
              <span
                className="track-btn-swatch"
                style={{ background: tokens.primary }}
              />
              <span style={{ flex: 1, textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 800, letterSpacing: "-0.01em" }}>
                  {track}
                </span>
                <span style={{ display: "block", fontSize: 10, color: isActive ? "inherit" : "var(--faint)", marginTop: 1 }}>
                  {TRACK_LABELS[track]}
                </span>
              </span>
              {isActive && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M4 7H10M10 7L7 4M10 7L7 10" stroke={tokens.primary} strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
          );
        })}

        <div className="track-divider" />

        {/* Mini stats */}
        <div className="mini-stats">
          <div className="mini-stats-row">
            <div>
              <div className="mini-stats-val">{sessionCount}</div>
              <div className="mini-stats-key">Sessions</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="mini-stats-val" style={{ color: avgScore >= 80 ? "var(--emerald)" : avgScore >= 60 ? "var(--gold)" : "var(--heart)" }}>
                {avgScore}%
              </div>
              <div className="mini-stats-key">Avg Score</div>
            </div>
          </div>

          {/* Streak dots */}
          <div className="streak-dots" aria-label="This week's activity">
            {DAYS.map((day, i) => {
              const isToday = i === 6;
              const hit = weekHits[i] ?? false;
              return (
                <div
                  key={i}
                  className={`streak-dot${hit ? (isToday ? " today" : " hit") : ""}`}
                  title={day}
                  aria-label={`${day}: ${hit ? "completed" : "not completed"}`}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
