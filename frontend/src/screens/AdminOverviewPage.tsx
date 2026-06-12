import { useEffect, useState } from "react";
import { useAdminOutlet, CohortData, AtRiskItem, fmtTokens } from "./adminShared";

const API = "";

export function AdminOverviewPage() {
  const { openDetail } = useAdminOutlet();

  const [cohort, setCohort] = useState<CohortData | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskItem[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [aiInsight, setAiInsight] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/supervisor/cohort`, { credentials: "include" }).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/supervisor/at-risk`, { credentials: "include" }).then(r => r.json()).catch(() => ({ at_risk: [] })),
      fetch(`${API}/api/admin/token-summary`, { credentials: "include" }).then(r => r.json()).catch(() => ({ total_tokens: 0 })),
      fetch(`${API}/api/supervisor/insights`, { credentials: "include" }).then(r => r.json()).catch(() => ({ insight: "" })),
    ]).then(([cohortData, riskData, tokenData, insightData]) => {
      if (cohortData) setCohort(cohortData);
      setAtRisk(riskData?.at_risk ?? []);
      setTotalTokens(tokenData?.total_tokens ?? 0);
      setAiInsight(insightData?.insight ?? "");
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="w-8 h-8 border-2 border-[#F4EFE7]/20 border-t-[#F4EFE7]/60 rounded-full animate-spin" />
      </div>
    );
  }

  const kpis = [
    { label: "Total Students",  val: cohort?.total_students  ?? 0, color: "#60a5fa" },
    { label: "Active This Week", val: cohort?.active_this_week ?? 0, color: "#22c55e" },
    { label: "At Risk",          val: cohort?.at_risk_count   ?? 0, color: "#ef4444" },
    { label: "AI Tokens",        val: fmtTokens(totalTokens),       color: "#f59e0b" },
    { label: "Momentum",         val: "↑",                          color: "#a78bfa" },
  ];

  const cardStyle = { background: "rgba(244,239,231,0.04)", border: "1px solid rgba(244,239,231,0.08)" };

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {kpis.map(({ label, val, color }) => (
          <div key={label} className="rounded-[20px] p-4" style={cardStyle}>
            <div className="text-[#F4EFE7]/30 text-[9px] uppercase tracking-[0.14em] font-semibold mb-2">{label}</div>
            <div className="text-2xl font-medium tracking-[-0.03em]" style={{ color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* AI insight */}
      {aiInsight && (
        <div className="rounded-[20px] p-5" style={cardStyle}>
          <p className="text-[#F4EFE7]/40 text-[9px] uppercase tracking-[0.16em] font-semibold mb-2">AI Insight</p>
          <p className="text-[#F4EFE7]/60 text-sm leading-relaxed italic">"{aiInsight}"</p>
        </div>
      )}

      {/* Two panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* At-risk */}
        <div className="rounded-[20px] p-5" style={cardStyle}>
          <p className="text-red-400 text-[9px] uppercase tracking-[0.16em] font-semibold mb-3">At-Risk Students</p>
          {atRisk.length === 0 ? (
            <p className="text-[#F4EFE7]/25 text-sm">No at-risk students.</p>
          ) : (
            <div className="space-y-2">
              {atRisk.map(s => (
                <div key={s.student_id} className="flex items-center justify-between">
                  <button
                    onClick={() => openDetail(s.student_id)}
                    className="text-[#F4EFE7]/70 text-sm font-medium hover:text-[#F4EFE7] transition-colors text-left"
                  >
                    {s.name}
                  </button>
                  <span className="text-[#F4EFE7]/30 text-xs">{s.days_inactive}d · {s.weak_topic_count} weak</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weak topics */}
        <div className="rounded-[20px] p-5" style={cardStyle}>
          <p className="text-amber-400 text-[9px] uppercase tracking-[0.16em] font-semibold mb-3">Weak Topics</p>
          {(cohort?.weakest_topics ?? []).length === 0 ? (
            <p className="text-[#F4EFE7]/25 text-sm">No data yet.</p>
          ) : (
            <div className="space-y-2.5">
              {(cohort?.weakest_topics ?? []).slice(0, 5).map((t, i) => (
                <div key={t} className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(244,239,231,0.08)" }}>
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.max(20, 90 - i * 15)}%` }} />
                  </div>
                  <span className="text-[#F4EFE7]/50 text-xs shrink-0 w-28 truncate">{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
