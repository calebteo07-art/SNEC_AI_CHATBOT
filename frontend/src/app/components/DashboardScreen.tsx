import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import styles from '../../styles/animations.module.css';
import { ChangePasswordModal } from "./ChangePasswordModal";
import { CURRICULUM, OA_TOPICS, OT_TOPICS, PSA_TOPICS, type Track } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";
import { useProgress } from "../../hooks/useProgress";

const TRACK_TOPICS: Record<Track, typeof OA_TOPICS> = {
  OA:  OA_TOPICS,
  OT:  OT_TOPICS,
  PSA: PSA_TOPICS,
};

const TRACK_LABELS: Record<Track, string> = {
  OA: "Ophthalmic Assistant",
  OT: "Ophthalmic Technician",
  PSA: "Patient Service Assoc.",
};

function scoreToStars(score: number): number {
  if (score >= 0.85) return 3;
  if (score >= 0.65) return 2;
  if (score >= 0.4)  return 1;
  return 0;
}

function formatRelativeDate(ts: string): string {
  const now = Date.now();
  const diff = Math.floor((now - new Date(ts).getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff}d ago`;
}

function TopicIcon({ icon, color }: { icon: string; color: string }) {
  switch (icon) {
    case "microscope":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18h12M10 18V9m4 9V9m-7-4.5L9 3l4.5 4.5L12 9H8L6 4.5z" /></svg>;
    case "drop":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C12 2 5 10 5 15a7 7 0 0014 0C19 10 12 2 12 2z" /></svg>;
    case "clipboard":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" /><rect x="4" y="4" width="16" height="18" rx="2" /><line x1="8" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="13" y2="15" /></svg>;
    case "camera":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>;
    case "waveform":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,12 6,4 10,20 14,8 18,16 22,12" /></svg>;
    case "ruler":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l18-18M8 21l13-13M3 16l8-8" /><line x1="9" y1="3" x2="21" y2="15" /></svg>;
    case "lightbulb":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21h6M12 3a6 6 0 016 6c0 2.5-1.5 4.5-3 6H9c-1.5-1.5-3-3.5-3-6a6 6 0 016-6z" /></svg>;
    case "eye":
    default:
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
  }
}

function StarRow({ stars, track }: { stars: number; track: Track }) {
  const color = track === "OA" ? "var(--teal)" : track === "OT" ? "var(--purple)" : "var(--emerald)";
  return (
    <div className="topic-card-stars">
      {[1, 2, 3].map(i => (
        <svg key={i} width="11" height="11" viewBox="0 0 14 14">
          <polygon
            points="7,1.5 8.8,5.5 13,5.9 10,8.6 11,12.5 7,10.2 3,12.5 4,8.6 1,5.9 5.2,5.5"
            fill={i <= stars ? color : "var(--border)"}
          />
        </svg>
      ))}
    </div>
  );
}

export function DashboardScreen() {
  const navigate = useNavigate();
  const { user, setMustChangePassword } = useAuth();

  const activeTrack = (user?.studentRole as Track) || "OA";
  const { data: progress } = useProgress();

  const completedIds = (progress?.topic_performance ?? [])
    .filter(p => p.score >= 0.65)
    .map(p => p.topic);

  const topics = TRACK_TOPICS[activeTrack];
  const tokens = trackTokens(activeTrack);

  const firstNotDoneIdx = topics.findIndex(t => !completedIds.includes(t.id));
  const activeId = firstNotDoneIdx >= 0 ? topics[firstNotDoneIdx].id : null;

  const topicProgress = topics.map((topic, idx) => {
    const perf = progress?.topic_performance?.find(p => p.topic === topic.id);
    const isDone = completedIds.includes(topic.id);
    const isActive = topic.id === activeId;
    const isUnlocked = idx === 0 || completedIds.includes(topics[idx - 1].id);

    let state: "done" | "active" | "locked" = "locked";
    if (isDone) state = "done";
    else if (isActive || isUnlocked) state = "active";

    return {
      topicId: topic.id,
      state,
      stars: scoreToStars(perf?.score ?? 0),
      score: perf ? Math.round(perf.score * 100) : null,
    };
  });

  const recentSessions = (progress?.sessions ?? []).slice(0, 8);

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="screen-curriculum">
      {user?.mustChangePassword && (
        <ChangePasswordModal forced onSuccess={() => setMustChangePassword(false)} />
      )}

      {/* Role header — non-interactive, locked to assigned track */}
      <div className={`curriculum-tabs ${styles.fadeSlideIn} ${styles.item1}`} data-visible={visible ? 'true' : 'false'}>
        <div className="curriculum-tab active" style={{ pointerEvents: "none" }}>
          {TRACK_LABELS[activeTrack]}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "0 4px",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
          color: tokens.primary, alignSelf: "center",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: tokens.primary }} />
          {activeTrack} Track
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        <div className={`curriculum-grid ${styles.fadeSlideIn} ${styles.item2}`} data-visible={visible ? 'true' : 'false'}>
          {topics.map((topic, idx) => {
            const prog = topicProgress[idx];
            const scoreStr = prog.score !== null ? `${prog.score}%` : "—";

            return (
              <div
                key={topic.id}
                className={`topic-card topic-card--${prog.state}`}
                onClick={() => prog.state !== "locked" && navigate(`/flashcards?topic=${topic.id}`)}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="topic-card-num">#{idx + 1}</span>
                  {prog.state === "locked" && (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <rect x="3" y="7" width="10" height="8" rx="2" fill="var(--faint)" />
                      <path d="M5 7V5a3 3 0 016 0v2" stroke="var(--faint)" strokeWidth="1.5" />
                    </svg>
                  )}
                  {prog.state === "done" && (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8L6.5 11.5L13 5" stroke="var(--emerald)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                <TopicIcon icon={topic.icon} color={prog.state === "locked" ? "var(--faint)" : tokens.primary} />

                <div className="topic-card-name">{topic.label}</div>
                <div className="topic-card-score" style={{ color: prog.score !== null ? tokens.primary : "var(--faint)" }}>
                  {scoreStr}
                </div>

                <StarRow stars={prog.stars} track={activeTrack} />

                {prog.state !== "locked" && (
                  <div className="topic-card-actions">
                    <button className="topic-card-btn topic-card-btn--primary"
                      onClick={e => { e.stopPropagation(); navigate(`/flashcards?topic=${topic.id}`); }}>
                      Learn
                    </button>
                    <button className="topic-card-btn"
                      onClick={e => { e.stopPropagation(); navigate(`/cases?topic=${topic.id}`); }}>
                      Cases
                    </button>
                    <button className="topic-card-btn"
                      onClick={e => { e.stopPropagation(); navigate(`/chat?topic=${topic.id}`); }}>
                      Chat
                    </button>
                  </div>
                )}

                {prog.state === "locked" && idx > 0 && (
                  <div className="topic-card-locked-hint">Complete #{idx} first</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <div className={`session-log ${styles.fadeSlideIn} ${styles.item3}`} data-visible={visible ? 'true' : 'false'}>
            <div className="session-log-header">Recent Sessions</div>
            {recentSessions.map((s, i) => {
              const topicInfo = CURRICULUM.find(t => t.id === s.topic);
              return (
                <div key={i} className="session-log-row">
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--faint)", width: 72, flexShrink: 0 }}>
                    {formatRelativeDate(s.timestamp)}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600, color: "var(--text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {topicInfo?.label ?? s.topic}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontSize: 11, flexShrink: 0 }}>
                    {s.mode}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {recentSessions.length === 0 && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
            No sessions yet — click <strong style={{ color: "var(--teal)" }}>Learn</strong> on any topic to start.
          </div>
        )}
      </div>
    </div>
  );
}
