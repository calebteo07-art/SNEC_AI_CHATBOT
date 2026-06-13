"use client";
/* AURORA admin overview — cohort KPIs, AI insight, at-risk list, weak-topic
   bars, and the generative-media refresh control. Same endpoints as before. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminOutlet, fmtTokens } from "@/screens/adminShared";
import { StatCard } from "@/aurora/components/StatCard";

interface Cohort { total_students?: number; total?: number; active_this_week: number; at_risk_count: number; weakest_topics: string[]; }
interface RiskItem { student_id: string; name?: string; days_inactive: number; weak_topic_count?: number; weak_count?: number; weak_topics?: string[]; }

export function AdminOverview() {
  const { openDetail } = useAdminOutlet();
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [atRisk, setAtRisk] = useState<RiskItem[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [insight, setInsight] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/supervisor/cohort", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/supervisor/at-risk", { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/token-summary", { credentials: "include" }).then((r) => r.json()).catch(() => ({ total_tokens: 0 })),
      fetch("/api/supervisor/insights", { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
    ]).then(([cohortData, riskData, tokenData, insightData]) => {
      if (cohortData) setCohort(cohortData);
      setAtRisk(riskData?.students ?? riskData?.at_risk ?? []);
      setTotalTokens(tokenData?.total_tokens ?? 0);
      setInsight(insightData?.narrative ?? insightData?.insight ?? "");
    }).finally(() => setLoading(false));
  }, []);

  const refreshMedia = async () => {
    try {
      const res = await fetch("/api/media/refresh", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kinds: ["svg"] }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.detail ?? "Media refresh unavailable."); return; }
      if (data.status !== "queued") { toast.info(data.detail ?? "Nothing to queue."); return; }
      toast.info("Media refresh queued — regenerating accents…");
      const poll = setInterval(async () => {
        try {
          const jr = await fetch(`/api/media/jobs/${data.job_id}`, { credentials: "include" });
          const job = await jr.json();
          if (job.status === "success") { clearInterval(poll); toast.success(`Media library v${job.result?.manifest_version} ready (${job.result?.accents} accents).`); }
          else if (job.status === "failure") { clearInterval(poll); toast.error(`Media refresh failed: ${job.detail ?? "unknown error"}`); }
        } catch { clearInterval(poll); }
      }, 4000);
    } catch { toast.error("Media refresh unavailable."); }
  };

  if (loading) return <p className="aurora-muted">Loading cohort…</p>;

  const totalStudents = cohort?.total_students ?? cohort?.total ?? 0;
  const weak = cohort?.weakest_topics ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="aurora-btn-ghost" onClick={refreshMedia}>↻ Refresh media library</button>
      </div>

      <div className="aurora-kpis">
        <StatCard tone="blue" label="Total students" value={totalStudents} />
        <StatCard tone="blue" label="Active this week" value={cohort?.active_this_week ?? 0} />
        <StatCard tone="rose" label="At risk" value={cohort?.at_risk_count ?? 0} />
        <StatCard tone="purple" label="AI tokens" value={fmtTokens(totalTokens)} />
      </div>

      {insight && (
        <div className="aurora-insight">
          <p>“{insight}”</p>
        </div>
      )}

      <div className="aurora-panels">
        <section className="aurora-card" aria-label="At-risk students">
          <p className="aurora-activity-head">At-risk students</p>
          {atRisk.length === 0 ? (
            <p className="aurora-muted">No at-risk students.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {atRisk.map((s) => {
                const count = s.weak_count ?? s.weak_topic_count ?? s.weak_topics?.length ?? 0;
                return (
                  <div key={s.student_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <button type="button" className="aurora-feed-name" onClick={() => openDetail(s.student_id)}>
                      {s.name ?? `${s.student_id.slice(0, 8)}…`}
                    </button>
                    <span className="aurora-tcell is-mono" style={{ flexShrink: 0 }}>{s.days_inactive}d · {count} weak</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="aurora-card" aria-label="Weak topics">
          <p className="aurora-activity-head">Weak topics</p>
          {weak.length === 0 ? (
            <p className="aurora-muted">No data yet.</p>
          ) : (
            <div className="aurora-bars">
              {weak.slice(0, 5).map((t, i) => (
                <div key={t} className="aurora-bar-row">
                  <span className="aurora-bar-track"><span className="aurora-bar-fill" data-weak="true" style={{ width: `${Math.max(20, 90 - i * 15)}%` }} /></span>
                  <span className="aurora-bar-label" style={{ textAlign: "left", width: "auto", flex: 1 }}>{t.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
