"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/providers/AuthProvider";

interface CohortData {
  total: number;
  active_this_week: number;
  inactive_7_plus_days: unknown[];
  weakest_topics: string[];
  at_risk_count: number;
}

interface AtRiskStudent {
  student_id: string;
  last_active: string;
  days_inactive: number;
  weak_topics: string[];
  weak_count: number;
}

interface BenchmarkTopic {
  topic: string;
  avg_score: number;
  student_count: number;
}

function topicLabel(raw: string) {
  return raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const scoreColor = (pct: number) => pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";

export default function SupervisorPage() {
  const { user } = useAuth();
  const [cohort, setCohort] = useState<CohortData | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkTopic[]>([]);
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [digestSending, setDigestSending] = useState(false);
  const [digestStatus, setDigestStatus] = useState<"idle" | "sent" | "error">("idle");

  const fetchData = useCallback(() => {
    setLoading(true); setError(null);
    Promise.all([
      fetch("/api/supervisor/cohort", { credentials: "include" }).then(r => r.json()),
      fetch("/api/supervisor/at-risk", { credentials: "include" }).then(r => r.json()),
    ])
      .then(([cohortData, atRiskData]) => {
        setCohort(cohortData);
        setAtRisk(atRiskData.students ?? []);
        setLoading(false);
      })
      .catch(() => { setError("Could not load supervisor data."); setLoading(false); });

    fetch("/api/supervisor/insights", { credentials: "include" })
      .then(r => r.json()).then(d => setInsights(d.narrative)).catch(() => null);

    fetch("/api/supervisor/benchmarks", { credentials: "include" })
      .then(r => r.json()).then(d => setBenchmarks(d.topics ?? [])).catch(() => null);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSendDigest = () => {
    if (digestSending || !user?.email) return;
    setDigestSending(true); setDigestStatus("idle");
    fetch("/api/supervisor/send-digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ recipient: user.email }),
    })
      .then(r => { if (!r.ok) throw new Error(); })
      .then(() => setDigestStatus("sent"))
      .catch(() => setDigestStatus("error"))
      .finally(() => setDigestSending(false));
  };

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-[#1F1F1F]/50 text-[10px] uppercase tracking-[0.18em] font-semibold mb-1">Clinical Oversight</p>
          <h1 className="gem-gradient-text text-[52px] font-medium tracking-[-0.04em] leading-none">Cohort Overview</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="gem-glass rounded-full px-3 py-2 text-xs text-[#1F1F1F]/50 hover:text-[#1F1F1F] transition-colors"
          >
            ↺ Refresh
          </button>
          <button
            onClick={handleSendDigest}
            disabled={digestSending}
            className="bg-[#3C90FF] text-white rounded-full px-4 py-2 text-xs font-semibold hover:bg-[#5AA6FF] transition-colors disabled:opacity-50"
          >
            {digestSending ? "Sending…" : digestStatus === "sent" ? "Sent!" : digestStatus === "error" ? "Failed" : "Send digest"}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-[#1F1F1F]/40 text-sm py-8">
          <span className="w-5 h-5 border-2 border-[#3C90FF]/20 border-t-[#3C90FF] rounded-full animate-spin" />
          Loading cohort data…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-[16px] p-4 flex items-center justify-between mb-6">
          <p className="text-red-500 text-sm">{error}</p>
          <button onClick={fetchData} className="text-red-500 text-xs font-semibold hover:opacity-70">Retry</button>
        </div>
      )}

      {/* AI narrative */}
      {insights && (
        <blockquote
          className="border-l-2 border-[#3C90FF]/30 pl-6 mb-8 max-w-2xl"
          style={{ fontSize: "1.15rem", lineHeight: 1.55, fontWeight: 400, color: "rgba(31,31,31,0.6)", fontStyle: "italic" }}
        >
          &quot;{insights}&quot;
        </blockquote>
      )}

      {cohort && (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { label: "Total Students", value: cohort.total, icon: "👥", color: "#3C90FF" },
              { label: "Active This Week", value: cohort.active_this_week, icon: "⚡", color: "#22c55e" },
              { label: "At Risk", value: cohort.at_risk_count, icon: "⚠️", color: cohort.at_risk_count > 0 ? "#ef4444" : "#22c55e" },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="gem-glass rounded-[24px] p-6">
                <div className="text-2xl mb-3">{icon}</div>
                <div className="text-[#1F1F1F]/40 text-[9px] uppercase tracking-[0.18em] font-semibold mb-2">{label}</div>
                <div className="text-4xl font-medium tracking-[-0.03em]" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Weakest topics */}
          {cohort.weakest_topics.length > 0 && (
            <div className="gem-glass rounded-[24px] p-6 mb-6">
              <p className="text-[#1F1F1F]/40 text-[9px] uppercase tracking-[0.18em] font-semibold mb-4">Weakest Topics</p>
              <div className="flex flex-wrap gap-2">
                {cohort.weakest_topics.map((t, i) => (
                  <span
                    key={t}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{
                      background: `rgba(239,68,68,${0.15 - i * 0.02})`,
                      border: `1px solid rgba(239,68,68,${0.3 - i * 0.04})`,
                      color: "#ef4444",
                    }}
                  >
                    {topicLabel(t)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Benchmarks */}
          {benchmarks.length > 0 && (
            <div className="gem-glass rounded-[24px] p-6 mb-6">
              <p className="text-[#1F1F1F]/40 text-[9px] uppercase tracking-[0.18em] font-semibold mb-4">Cohort Benchmarks</p>
              <div className="space-y-3">
                {benchmarks.map((b, i) => {
                  const pct = Math.round(b.avg_score * 100);
                  const color = scoreColor(pct);
                  return (
                    <div key={b.topic} className="flex items-center gap-4" style={{ animationDelay: `${i * 40}ms` }}>
                      <span className="text-[#1F1F1F]/50 text-xs w-44 truncate text-right shrink-0">{topicLabel(b.topic)}</span>
                      <div className="flex-1 h-2 bg-black/[0.06] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <span className="text-xs font-semibold shrink-0 w-10" style={{ color }}>{pct}%</span>
                      <span className="text-[#1F1F1F]/25 text-xs shrink-0">{b.student_count}s</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* At-risk students */}
          {atRisk.length > 0 && (
            <div className="gem-glass rounded-[24px] overflow-hidden">
              <div className="p-5 border-b border-black/[0.06]">
                <p className="text-[#1F1F1F]/40 text-[9px] uppercase tracking-[0.18em] font-semibold">Students Needing Attention ({atRisk.length})</p>
              </div>
              <div className="divide-y divide-black/[0.04]">
                {atRisk.map(s => (
                  <div key={s.student_id} className="flex items-center gap-4 p-4 hover:bg-black/[0.02] transition-colors">
                    <div className="w-9 h-9 rounded-full bg-red-500/12 border border-red-500/20 flex items-center justify-center text-red-500 text-xs font-bold shrink-0">
                      {s.days_inactive}d
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#1F1F1F]/70 text-sm font-medium">{s.student_id}</div>
                      <div className="text-[#1F1F1F]/35 text-xs">{s.days_inactive} days inactive · {s.weak_count} weak topics</div>
                    </div>
                    {s.weak_topics.length > 0 && (
                      <div className="flex gap-1 flex-wrap justify-end max-w-[200px]">
                        {s.weak_topics.slice(0, 3).map(t => (
                          <span key={t} className="bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 text-[9px] font-semibold text-amber-600">
                            {topicLabel(t)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {atRisk.length === 0 && !loading && (
            <div className="gem-glass rounded-[24px] p-8 text-center border-emerald-200">
              <p className="text-emerald-600 text-sm font-medium">No at-risk students — great cohort health.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
