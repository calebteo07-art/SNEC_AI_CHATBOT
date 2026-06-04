import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { TrackSidebar } from "./TrackSidebar";
import { SkillPath, type TopicProgress } from "./SkillPath";
import { NodeTooltip } from "./NodeTooltip";
import { CURRICULUM, OA_TOPICS, OT_TOPICS, PSA_TOPICS, type Track } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";
import type { ProgressData } from "../utils/curriculum";

const TRACK_TOPICS: Record<Track, typeof OA_TOPICS> = {
  OA:  OA_TOPICS,
  OT:  OT_TOPICS,
  PSA: PSA_TOPICS,
};

function scoreToStars(score: number): number {
  if (score >= 0.85) return 3;
  if (score >= 0.65) return 2;
  if (score >= 0.4)  return 1;
  return 0;
}

function buildWeekHits(sessions: ProgressData["sessions"]): boolean[] {
  const hits = Array(7).fill(false) as boolean[];
  const now = new Date();
  sessions.forEach(s => {
    const d = new Date(s.timestamp);
    const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    if (diff >= 0 && diff < 7) hits[6 - diff] = true;
  });
  return hits;
}

export function DashboardScreen() {
  const navigate  = useNavigate();
  const { user, setStudentRole, setMustChangePassword } = useAuth();

  const [activeTrack, setActiveTrack]     = useState<Track>((user?.studentRole as Track) || "OA");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [progress, setProgress]           = useState<ProgressData | null>(null);
  const [roleChanging, setRoleChanging]   = useState(false);

  /* Fetch live progress */
  useEffect(() => {
    fetch("/api/progress", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setProgress(d))
      .catch(() => { /* keep null — we show locked state */ });
  }, []);

  /* Role change — preserved from original */
  const handleRoleChange = async (role: Track) => {
    if (!user?.studentId || role === user.studentRole || roleChanging) return;
    setRoleChanging(true);
    setActiveTrack(role);
    try {
      const res = await fetch("/api/profile/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (res.ok) setStudentRole(role);
    } finally {
      setRoleChanging(false);
    }
  };

  /* Build TopicProgress from API data */
  const completedIds = (progress?.topic_performance ?? [])
    .filter(p => p.score >= 0.65)
    .map(p => p.topic);

  const topics = TRACK_TOPICS[activeTrack];

  const firstNotDoneIdx = topics.findIndex(t => !completedIds.includes(t.id));
  const activeId = firstNotDoneIdx >= 0 ? topics[firstNotDoneIdx].id : null;

  const topicProgress: TopicProgress[] = topics.map((topic, idx) => {
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
    };
  });

  const selectedTopic  = selectedNodeId ? CURRICULUM.find(t => t.id === selectedNodeId) ?? null : null;
  const selectedProg   = topicProgress.find(p => p.topicId === selectedNodeId);
  const tokens         = trackTokens(activeTrack);

  const weekHits    = buildWeekHits(progress?.sessions ?? []);
  const sessionCount = progress?.session_count ?? 0;
  const topPerf     = progress?.topic_performance ?? [];
  const avgScore    = topPerf.length > 0
    ? Math.round((topPerf.reduce((s, p) => s + p.score, 0) / topPerf.length) * 100)
    : 0;

  return (
    <div className="screen-learn">
      {/* Forced password change */}
      {user?.mustChangePassword && (
        <ChangePasswordModal
          forced
          onSuccess={() => setMustChangePassword(false)}
        />
      )}

      {/* Track selector sidebar */}
      <TrackSidebar
        activeTrack={activeTrack}
        onTrackChange={handleRoleChange}
        weekHits={weekHits}
        sessionCount={sessionCount}
        avgScore={avgScore}
      />

      {/* Winding path area */}
      <div className="path-area">
        {/* Decorative floating anatomy image */}
        <img
          className="path-deco"
          src="/anatomy/eye-fundus.png"
          aria-hidden="true"
          alt=""
        />

        <div className="path-scroll">
          {/* Section banner */}
          <div
            className="path-section-banner"
            style={{ borderColor: tokens.primary, color: tokens.primary }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <polygon points="7,1.5 8.8,5.5 13,5.9 10,8.6 11,12.5 7,10.2 3,12.5 4,8.6 1,5.9 5.2,5.5" fill="currentColor" />
            </svg>
            {activeTrack} Track
          </div>

          {/* The winding skill path */}
          <SkillPath
            topics={topics}
            progress={topicProgress}
            onNodeClick={id => setSelectedNodeId(prev => prev === id ? null : id)}
            onStartLesson={id => navigate(`/flashcards?topic=${id}`)}
          />
        </div>

        {/* Node tooltip — appears when a node is selected */}
        <NodeTooltip
          topic={selectedTopic}
          state={selectedProg?.state ?? "locked"}
          stars={selectedProg?.stars ?? 0}
          onClose={() => setSelectedNodeId(null)}
          onLearn={id => { setSelectedNodeId(null); navigate(`/flashcards?topic=${id}`); }}
          onSimulate={id => { setSelectedNodeId(null); navigate(`/cases?topic=${id}`); }}
          onChat={id => { setSelectedNodeId(null); navigate(`/chat?topic=${id}`); }}
        />
      </div>
    </div>
  );
}
