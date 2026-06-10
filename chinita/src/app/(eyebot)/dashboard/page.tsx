"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { useProgress } from "@/hooks/useProgress";
import { OA_TOPICS, OT_TOPICS, PSA_TOPICS } from "@/lib/curriculum";
import { trackTokens } from "@/lib/trackColors";
import type { Track } from "@/lib/curriculum";
import { cn } from "@/lib/utils";

const TRACK_TOPICS: Record<Track, typeof OA_TOPICS> = { OA: OA_TOPICS, OT: OT_TOPICS, PSA: PSA_TOPICS };
const TRACK_LABELS: Record<Track, string> = {
  OA: "Ophthalmic Assistant",
  OT: "Ophthalmic Technician",
  PSA: "Patient Service Associate",
};

function scoreToStars(score: number): number {
  if (score >= 0.85) return 3;
  if (score >= 0.65) return 2;
  if (score >= 0.4) return 1;
  return 0;
}

function StarRow({ stars, color }: { stars: number; color: string }) {
  return (
    <div className="flex gap-1 mt-1.5">
      {[1, 2, 3].map(i => (
        <svg key={i} width="16" height="16" viewBox="0 0 14 14">
          <polygon
            points="7,1.5 8.8,5.5 13,5.9 10,8.6 11,12.5 7,10.2 3,12.5 4,8.6 1,5.9 5.2,5.5"
            fill={i <= stars ? color : "rgba(0,0,0,0.12)"}
          />
        </svg>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: progress } = useProgress();

  const activeTrack = (user?.studentRole as Track) || "OA";
  const tokens = trackTokens(activeTrack);
  const topics = TRACK_TOPICS[activeTrack];

  const completedIds = useMemo(
    () => (progress?.topic_performance ?? []).filter(p => p.score >= 0.65).map(p => p.topic),
    [progress]
  );

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

  const xp = progress?.xp ?? 0;
  const streak = progress?.streak ?? 0;
  const hearts = progress?.hearts ?? 5;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 lg:px-10 lg:py-16">
      {/* Hero stats bar */}
      <div className="flex items-center justify-between mb-12">
        <div>
          <p className="text-[#1F1F1F]/50 text-xs uppercase tracking-[0.22em] font-semibold mb-2">
            {TRACK_LABELS[activeTrack]}
          </p>
          <h1 className="gem-gradient-text text-[64px] sm:text-[80px] font-medium tracking-[-0.04em] leading-none">
            Learn
          </h1>
        </div>

        <div className="gem-glass rounded-full px-7 py-4 flex items-center gap-6 text-lg font-semibold text-[#1F1F1F]">
          <span title="XP" className="flex items-center gap-2">⚡ {xp}</span>
          <span className="text-black/20">·</span>
          <span title="Streak" className="flex items-center gap-2">🔥 {streak}</span>
          <span className="text-black/20">·</span>
          <span title="Hearts" className="flex items-center gap-2">❤️ {hearts}</span>
        </div>
      </div>

      {/* Track badge */}
      <div
        className="inline-flex items-center gap-2.5 rounded-full px-5 py-2 mb-10 text-sm font-semibold"
        style={{ background: tokens.bg, border: `1px solid ${tokens.cardBorder}`, color: tokens.primary }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: tokens.primary }} />
        {activeTrack} Track
      </div>

      {/* Topic grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {topics.map((topic, idx) => {
          const prog = topicProgress[idx];
          const isLocked = prog.state === "locked";
          const isDone = prog.state === "done";

          return (
            <div
              key={topic.id}
              className={cn(
                "gem-glass rounded-[28px] p-7 transition-all flex flex-col",
                isLocked ? "opacity-50" : "hover:shadow-lg hover:-translate-y-0.5"
              )}
              style={!isLocked ? { borderColor: tokens.cardBorder } : {}}
            >
              {/* Index + state icon */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#1F1F1F]/30 text-xs font-mono font-semibold tracking-wide">#{idx + 1}</span>
                {isLocked && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="3" y="7" width="10" height="8" rx="2" fill="rgba(0,0,0,0.15)" />
                    <path d="M5 7V5a3 3 0 016 0v2" stroke="rgba(0,0,0,0.15)" strokeWidth="1.5" />
                  </svg>
                )}
                {isDone && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8L6.5 11.5L13 5" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>

              <div className="text-[#1F1F1F]/80 text-xl font-semibold mb-1.5 leading-tight">{topic.label}</div>
              <div className="text-sm font-medium mb-1" style={{ color: prog.score !== null && !isLocked ? tokens.primary : "rgba(0,0,0,0.25)" }}>
                {prog.score !== null ? `${prog.score}%` : "—"}
              </div>
              <StarRow stars={prog.stars} color={tokens.primary} />

              <div className="mt-6 flex-1 flex items-end">
                {!isLocked && (
                  <Link
                    href={`/flashcards?topic=${topic.id}`}
                    className="w-full block text-center text-sm font-semibold py-2.5 rounded-full transition-colors"
                    style={{ background: tokens.primary, color: "#FFFFFF" }}
                  >
                    Learn
                  </Link>
                )}

                {isLocked && idx > 0 && (
                  <div className="text-xs text-[#1F1F1F]/25">Complete #{idx} first</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
