"use client";

import Image from "next/image";
import { useProgress } from "@/hooks/useProgress";

function topicLabel(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function trackColor(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("ot-") || t.startsWith("ot")) return "#a78bfa";
  if (t.includes("psa-") || t.startsWith("psa")) return "#34d399";
  return "#22c55e";
}

function trackBg(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("ot-") || t.startsWith("ot")) return "rgba(167,139,250,0.12)";
  if (t.includes("psa-") || t.startsWith("psa")) return "rgba(52,211,153,0.12)";
  return "rgba(34,197,94,0.12)";
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
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Hero section */}
      <div className="relative rounded-[30px] overflow-hidden mb-8 h-52">
        <Image src="/images/eye-fundus.png" alt="" fill sizes="1000px" className="object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#181717]/90 via-[#181717]/60 to-transparent" />
        <div className="absolute inset-0 p-8 flex flex-col justify-end">
          <p className="text-[#F4EFE7]/40 text-[10px] uppercase tracking-[0.18em] font-semibold mb-2">SNEC Clinical Education</p>
          <h1 className="text-[#F4EFE7] text-[52px] font-medium tracking-[-0.04em] leading-none">My Progress®</h1>
          <p className="text-[#F4EFE7]/50 text-sm mt-2">
            {velocity === "improving" ? "↑ Improving" : velocity === "declining" ? "↓ Needs attention" : "→ Stable"}
          </p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-3 text-[#F4EFE7]/40 text-sm mb-8">
          <span className="w-5 h-5 border-2 border-[#F4EFE7]/20 border-t-[#F4EFE7]/60 rounded-full animate-spin" />
          Loading…
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-[16px] p-4 flex items-center justify-between mb-8">
          <p className="text-red-400 text-sm">Could not load your progress.</p>
          <button onClick={() => refetch()} className="text-red-400 text-xs font-semibold hover:opacity-70">Retry</button>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-5">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Day Streak", val: streak, unit: "days", color: "#f59e0b" },
                { label: "Total Sessions", val: sessionCount, unit: "", color: "#60a5fa" },
                { label: "Avg Accuracy", val: `${avgScore}%`, unit: "", color: avgScore >= 80 ? "#22c55e" : avgScore >= 60 ? "#f59e0b" : "#ef4444" },
                { label: "Topics Studied", val: topicPerf.length, unit: "", color: "#a78bfa" },
              ].map(s => (
                <div
                  key={s.label}
                  className="rounded-[20px] p-4"
                  style={{ background: "rgba(244,239,231,0.04)", border: "1px solid rgba(244,239,231,0.08)" }}
                >
                  <div className="text-[#F4EFE7]/30 text-[9px] uppercase tracking-[0.14em] font-semibold mb-2">{s.label}</div>
                  <div className="text-2xl font-medium tracking-[-0.03em]" style={{ color: s.color }}>
                    {s.val}{s.unit ? ` ${s.unit}` : ""}
                  </div>
                </div>
              ))}
            </div>

            {/* 7-day calendar */}
            <div className="rounded-[20px] p-5" style={{ background: "rgba(244,239,231,0.04)", border: "1px solid rgba(244,239,231,0.08)" }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#F4EFE7]/40 text-[9px] uppercase tracking-[0.16em] font-semibold">This Week</p>
                <span className="text-[#F4EFE7]/30 text-xs">{weekHits.filter(Boolean).length}/7</span>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_LABELS.map((d, i) => (
                  <div key={i} className="text-center">
                    <div className="text-[#F4EFE7]/25 text-[10px] mb-1.5">{d}</div>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold mx-auto"
                      style={{
                        background: weekHits[i] ? ((1 + i) % 7 === today ? "#F4EFE7" : "rgba(244,239,231,0.2)") : "rgba(244,239,231,0.04)",
                        color: weekHits[i] ? ((1 + i) % 7 === today ? "#181717" : "#F4EFE7") : "rgba(244,239,231,0.15)",
                        border: weekHits[i] ? "none" : "1px solid rgba(244,239,231,0.08)",
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
                <p className="text-[#F4EFE7]/40 text-[9px] uppercase tracking-[0.16em] font-semibold mb-3">Focus Areas</p>
                <div className="flex flex-wrap gap-2">
                  {data.weak_topics.map(t => (
                    <span
                      key={t}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}
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
                <p className="text-[#F4EFE7]/40 text-[9px] uppercase tracking-[0.16em] font-semibold mb-4">Topic Mastery</p>
                <div className="space-y-3">
                  {[...topicPerf].sort((a, b) => b.score - a.score).map(({ topic, score }) => {
                    const pct = Math.round(score * 100);
                    const color = trackColor(topic);
                    const bg = trackBg(topic);
                    return (
                      <div key={topic} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: bg }}>
                          <svg width="12" height="12" viewBox="0 0 28 28" fill="none">
                            <ellipse cx="14" cy="14" rx="9" ry="6" stroke={color} strokeWidth="1.8" />
                            <circle cx="14" cy="14" r="3.5" fill={color} />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[#F4EFE7]/70 text-xs font-medium truncate mb-1">{topicLabel(topic)}</div>
                          <div className="h-1.5 bg-[#F4EFE7]/8 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, background: color }}
                            />
                          </div>
                        </div>
                        <div className="text-xs font-semibold shrink-0" style={{ color }}>{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-[#F4EFE7]/25 text-sm">
                Complete a study session to see mastery data.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
