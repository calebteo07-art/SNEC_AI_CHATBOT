"use client";

import { useProgress } from "@/hooks/useProgress";

function topicLabel(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function trackColor(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("ot-") || t.startsWith("ot")) return "#a78bfa";
  if (t.includes("psa-") || t.startsWith("psa")) return "#34d399";
  return "#3C90FF";
}

function trackBg(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("ot-") || t.startsWith("ot")) return "rgba(167,139,250,0.12)";
  if (t.includes("psa-") || t.startsWith("psa")) return "rgba(52,211,153,0.12)";
  return "rgba(60,144,255,0.12)";
}

function buildWeekHits(sessions: { timestamp: string }[]): boolean[] {
  const hits = Array(7).fill(false) as boolean[];
  const now = new Date();
  sessions.forEach(s => {
    const diff = Math.floor((now.getTime() - new Date(s.timestamp).getTime()) / 86_400_000);
    if (diff >= 0 && diff < 7) hits[6 - diff] = true;
  });
  return hits;
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export default function ProgressPage() {
  const { data, isLoading, isError, refetch } = useProgress();

  const weekHits = buildWeekHits(data?.sessions ?? []);
  const sessionCount = data?.session_count ?? 0;
  const streak = data?.streak ?? 0;
  const topicPerf = data?.topic_performance ?? [];
  const avgScore = topicPerf.length > 0
    ? Math.round((topicPerf.reduce((s, p) => s + p.score, 0) / topicPerf.length) * 100)
    : 0;
  const velocity = data?.learning_velocity ?? "stable";
  const today = new Date().getDay();

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 lg:px-10 lg:py-16">
      {/* Hero */}
      <div className="mb-12">
        <p className="text-[#1F1F1F]/50 text-xs uppercase tracking-[0.22em] font-semibold mb-2">SNEC Clinical Education</p>
        <h1 className="gem-gradient-text text-[64px] sm:text-[80px] font-medium tracking-[-0.04em] leading-none">My Progress</h1>
        <p className="text-[#1F1F1F]/50 text-base mt-3">
          {velocity === "improving" ? "↑ Improving" : velocity === "declining" ? "↓ Needs attention" : "→ Stable"}
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-3 text-[#1F1F1F]/40 text-sm mb-8">
          <span className="w-5 h-5 border-2 border-[#3C90FF]/20 border-t-[#3C90FF] rounded-full animate-spin" />
          Loading…
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-[16px] p-4 flex items-center justify-between mb-8">
          <p className="text-red-500 text-sm">Could not load your progress.</p>
          <button onClick={() => refetch()} className="text-red-500 text-xs font-semibold hover:opacity-70">Retry</button>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Day Streak", val: streak, unit: "days", color: "#f59e0b" },
                { label: "Total Sessions", val: sessionCount, unit: "", color: "#3C90FF" },
                { label: "Avg Accuracy", val: `${avgScore}%`, unit: "", color: avgScore >= 80 ? "#22c55e" : avgScore >= 60 ? "#f59e0b" : "#ef4444" },
                { label: "Topics Studied", val: topicPerf.length, unit: "", color: "#a78bfa" },
              ].map(s => (
                <div key={s.label} className="gem-glass rounded-[24px] p-6">
                  <div className="text-[#1F1F1F]/40 text-xs uppercase tracking-[0.18em] font-semibold mb-2">{s.label}</div>
                  <div className="text-4xl font-medium tracking-[-0.03em]" style={{ color: s.color }}>
                    {s.val}{s.unit ? ` ${s.unit}` : ""}
                  </div>
                </div>
              ))}
            </div>

            {/* 7-day calendar */}
            <div className="gem-glass rounded-[24px] p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#1F1F1F]/40 text-xs uppercase tracking-[0.18em] font-semibold">This Week</p>
                <span className="text-[#1F1F1F]/30 text-sm">{weekHits.filter(Boolean).length}/7</span>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_LABELS.map((d, i) => (
                  <div key={i} className="text-center">
                    <div className="text-[#1F1F1F]/30 text-xs mb-1.5">{d}</div>
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold mx-auto"
                      style={{
                        background: weekHits[i] ? ((1 + i) % 7 === today ? "#3C90FF" : "rgba(60,144,255,0.15)") : "rgba(0,0,0,0.04)",
                        color: weekHits[i] ? ((1 + i) % 7 === today ? "#FFFFFF" : "#3C90FF") : "rgba(0,0,0,0.2)",
                        border: weekHits[i] ? "none" : "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Focus areas */}
            {(data.weak_topics ?? []).length > 0 && (
              <div>
                <p className="text-[#1F1F1F]/40 text-xs uppercase tracking-[0.18em] font-semibold mb-3">Focus Areas</p>
                <div className="flex flex-wrap gap-2">
                  {data.weak_topics.map(t => (
                    <span
                      key={t}
                      className="px-4 py-2 rounded-full text-sm font-semibold"
                      style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}
                    >
                      {topicLabel(t)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: topic mastery */}
          <div>
            {topicPerf.length > 0 ? (
              <>
                <p className="text-[#1F1F1F]/40 text-xs uppercase tracking-[0.18em] font-semibold mb-4">Topic Mastery</p>
                <div className="gem-glass rounded-[24px] p-6 space-y-4">
                  {[...topicPerf].sort((a, b) => b.score - a.score).map(({ topic, score }) => {
                    const pct = Math.round(score * 100);
                    const color = trackColor(topic);
                    const bg = trackBg(topic);
                    return (
                      <div key={topic} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: bg }}>
                          <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
                            <ellipse cx="14" cy="14" rx="9" ry="6" stroke={color} strokeWidth="1.8" />
                            <circle cx="14" cy="14" r="3.5" fill={color} />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[#1F1F1F]/70 text-sm font-medium truncate mb-1">{topicLabel(topic)}</div>
                          <div className="h-2 bg-black/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, background: color }}
                            />
                          </div>
                        </div>
                        <div className="text-sm font-semibold shrink-0" style={{ color }}>{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-[#1F1F1F]/25 text-sm">
                Complete a study session to see mastery data.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
