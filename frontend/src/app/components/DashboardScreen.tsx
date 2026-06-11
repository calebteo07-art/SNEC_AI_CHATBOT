import { useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { CURRICULUM, OA_TOPICS, OT_TOPICS, PSA_TOPICS, type Track } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";
import { useProgress } from "../../hooks/useProgress";

const TRACK_TOPICS: Record<Track, typeof OA_TOPICS> = {
  OA: OA_TOPICS,
  OT: OT_TOPICS,
  PSA: PSA_TOPICS,
};

const TRACK_LABELS: Record<Track, string> = {
  OA: "Ophthalmic Assistant",
  OT: "Ophthalmic Technician",
  PSA: "Patient Service Associate",
};

function scoreToStars(score: number): number {
  if (score >= 0.85) return 3;
  if (score >= 0.65) return 2;
  if (score >= 0.4)  return 1;
  return 0;
}

function formatRelativeDate(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff}d ago`;
}

function StarRow({ stars, color }: { stars: number; color: string }) {
  return (
    <div className="flex gap-0.5 mt-1">
      {[1, 2, 3].map(i => (
        <svg key={i} width="10" height="10" viewBox="0 0 14 14">
          <polygon
            points="7,1.5 8.8,5.5 13,5.9 10,8.6 11,12.5 7,10.2 3,12.5 4,8.6 1,5.9 5.2,5.5"
            fill={i <= stars ? color : "rgba(244,239,231,0.15)"}
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

  const tokens = trackTokens(activeTrack);
  const topics = TRACK_TOPICS[activeTrack];

  const completedIds = (progress?.topic_performance ?? [])
    .filter(p => p.score >= 0.65)
    .map(p => p.topic);

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
  const xp     = progress?.xp     ?? 0;
  const streak = progress?.streak  ?? 0;
  const hearts = progress?.hearts  ?? 5;

  return (
    <div className="max-w-4xl mx-auto px-5 py-6">
      {user?.mustChangePassword && (
        <ChangePasswordModal forced onSuccess={() => setMustChangePassword(false)} />
      )}

      {/* Hero stats bar */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-[#F4EFE7]/40 text-[10px] uppercase tracking-[0.18em] font-semibold mb-1">
            {TRACK_LABELS[activeTrack]}
          </p>
          <h1 className="text-[#F4EFE7] font-medium tracking-[-0.04em] leading-none"
              style={{ fontSize: "clamp(2.5rem, 8vw, 3rem)" }}>
            Learn®
          </h1>
        </div>

        {/* Stats pill */}
        <div data-tour="gamification" className="bg-[#F4EFE7] text-[#181717] rounded-full px-4 py-2 flex items-center gap-3 text-sm font-semibold">
          <span title="XP">⚡ {xp}</span>
          <span className="text-[#181717]/20">·</span>
          <span title="Streak">🔥 {streak}</span>
          <span className="text-[#181717]/20">·</span>
          <span title="Hearts">❤️ {hearts}</span>
        </div>
      </div>

      {/* Track badge */}
      <div
        className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-6 text-xs font-semibold"
        style={{ background: tokens.bg, border: `1px solid ${tokens.cardBorder}`, color: tokens.primary }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tokens.primary }} />
        {activeTrack} Track
      </div>

      {/* Topic grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-10">
        {topics.map((topic, idx) => {
          const prog = topicProgress[idx];
          const isLocked = prog.state === "locked";
          const isDone = prog.state === "done";

          return (
            <div
              key={topic.id}
              className="rounded-[24px] p-4 border transition-all"
              style={isLocked
                ? { background: "rgba(244,239,231,0.03)", borderColor: "rgba(244,239,231,0.08)", opacity: 0.5 }
                : { background: tokens.cardBg, borderColor: tokens.cardBorder, cursor: "pointer" }
              }
              onClick={() => !isLocked && navigate(`/flashcards?topic=${topic.id}`)}
            >
              {/* Index + state icon */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#F4EFE7]/30 text-[10px] font-mono">#{idx + 1}</span>
                {isLocked && (
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <rect x="3" y="7" width="10" height="8" rx="2" fill="rgba(244,239,231,0.2)" />
                    <path d="M5 7V5a3 3 0 016 0v2" stroke="rgba(244,239,231,0.2)" strokeWidth="1.5" />
                  </svg>
                )}
                {isDone && (
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8L6.5 11.5L13 5" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>

              <div className="text-[#F4EFE7]/80 text-sm font-medium mb-1 leading-tight">{topic.label}</div>
              <div className="text-[10px] mb-1" style={{ color: prog.score !== null && !isLocked ? tokens.primary : "rgba(244,239,231,0.25)" }}>
                {prog.score !== null ? `${prog.score}%` : "—"}
              </div>
              <StarRow stars={prog.stars} color={tokens.primary} />

              {!isLocked && (
                <div className="mt-3 space-y-1.5">
                  <button
                    className="w-full block text-center text-[10px] font-semibold py-1 rounded-full transition-colors"
                    style={{ background: tokens.primary, color: "#181717" }}
                    onClick={e => { e.stopPropagation(); navigate(`/flashcards?topic=${topic.id}`); }}
                  >
                    Learn
                  </button>
                  <div className="flex gap-1">
                    <button
                      className="flex-1 text-center text-[10px] font-semibold py-1 rounded-full transition-colors"
                      style={{ background: "rgba(244,239,231,0.08)", color: "rgba(244,239,231,0.5)" }}
                      onClick={e => { e.stopPropagation(); navigate(`/cases?topic=${topic.id}`); }}
                    >
                      Cases
                    </button>
                    <button
                      className="flex-1 text-center text-[10px] font-semibold py-1 rounded-full transition-colors"
                      style={{ background: "rgba(244,239,231,0.08)", color: "rgba(244,239,231,0.5)" }}
                      onClick={e => { e.stopPropagation(); navigate(`/chat?topic=${topic.id}`); }}
                    >
                      Chat
                    </button>
                  </div>
                </div>
              )}

              {isLocked && idx > 0 && (
                <div className="text-[10px] text-[#F4EFE7]/25 mt-2">Complete #{idx} first</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div>
          <p className="text-[#F4EFE7]/40 text-[10px] uppercase tracking-[0.18em] font-semibold mb-4">Recent Sessions</p>
          <div className="space-y-0">
            {recentSessions.map((s, i) => {
              const topicInfo = CURRICULUM.find(t => t.id === s.topic);
              return (
                <div key={i} className="flex items-center gap-4 py-2.5" style={{ borderBottom: "1px solid rgba(244,239,231,0.05)" }}>
                  <span className="text-[#F4EFE7]/25 text-xs font-mono w-16 shrink-0">{formatRelativeDate(s.timestamp)}</span>
                  <span className="text-[#F4EFE7]/70 text-xs font-medium flex-1 truncate">{topicInfo?.label ?? s.topic}</span>
                  <span className="text-[#F4EFE7]/25 text-xs font-mono shrink-0">{s.mode}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recentSessions.length === 0 && (
        <div className="text-center py-10 text-[#F4EFE7]/25 text-sm">
          No sessions yet — click <span className="text-[#F4EFE7]/60 font-semibold">Learn</span> on any topic to start.
        </div>
      )}
    </div>
  );
}
