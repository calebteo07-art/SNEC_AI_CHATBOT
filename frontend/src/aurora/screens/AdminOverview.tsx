"use client";
/* AURORA admin overview — cohort KPIs, AI insight, at-risk list, weak-topic
   bars, and the generative-media refresh control. Same endpoints as before. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminOutlet, fmtTokens } from "@/screens/adminShared";
import { StatCard } from "@/aurora/components/StatCard";
import { ProgressBar } from "@/aurora/components/ProgressBar";

interface InactiveStudent { student_id: string; last_active: string; days_inactive: number; }
interface Cohort {
  total_students?: number; total?: number; active_this_week: number;
  at_risk_count: number; weakest_topics: string[]; inactive_7_plus_days?: InactiveStudent[];
}
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
  const activeThisWeek = cohort?.active_this_week ?? 0;
  const inactive = cohort?.inactive_7_plus_days ?? [];
  const engagementPct = totalStudents > 0 ? Math.round((activeThisWeek / totalStudents) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Per-domain KPI colour coding: students=blue, engagement=green,
          at-risk=rose, AI cost=purple. */}
      <div className="aurora-kpis">
        <StatCard tone="blue" label="Total students" value={totalStudents} />
        <StatCard tone="green" label="Active this week" value={cohort?.active_this_week ?? 0} />
        <StatCard tone="rose" label="At risk" value={cohort?.at_risk_count ?? 0} />
        <StatCard tone="purple" label="AI tokens" value={fmtTokens(totalTokens)} />
      </div>

      {insight && (
        <div className="aurora-insight">
          <p>“{insight}”</p>
        </div>
      )}

      <div className="console-split">
        {/* PRIMARY — the action item: who needs attention. */}
        <section className="console-focus" aria-label="At-risk students">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
            <p className="aurora-activity-head" style={{ margin: 0 }}>Needs attention</p>
            <span className="console-attn-count">{atRisk.length} at risk</span>
          </div>
          {atRisk.length === 0 ? (
            <p className="aurora-muted">No at-risk students — the cohort is on track.</p>
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

        {/* SECONDARY — supporting context. */}
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

      {/* Cohort engagement — the weekly-activity signal the retired student
          Progress page used to carry, lifted to a cohort view for staff. */}
      <section className="aurora-card" aria-label="Cohort engagement">
        <div className="aurora-prog-card-head">
          <p className="aurora-activity-head" style={{ margin: 0 }}>Cohort engagement</p>
          <span className="aurora-prog-count">{activeThisWeek}/{totalStudents} active this week</span>
        </div>
        <ProgressBar percent={engagementPct} label="Share of cohort active this week" />
        <div className="aurora-mini-stats" style={{ marginTop: 16 }}>
          <div className="aurora-mini-stat"><div className="aurora-mini-stat-val">{engagementPct}%</div><div className="aurora-mini-stat-label">Active rate</div></div>
          <div className="aurora-mini-stat"><div className="aurora-mini-stat-val">{inactive.length}</div><div className="aurora-mini-stat-label">Inactive 7+ days</div></div>
          <div className="aurora-mini-stat"><div className="aurora-mini-stat-val">{cohort?.at_risk_count ?? 0}</div><div className="aurora-mini-stat-label">At risk</div></div>
        </div>
        <p className="aurora-muted" style={{ marginTop: 12, lineHeight: 1.6 }}>
          {inactive.length > 0
            ? `Longest gap: ${Math.max(...inactive.map((s) => s.days_inactive))} days. A nudge keeps students inactive a week or more from drifting.`
            : "Every student has been active in the last week — strong cohort momentum."}
        </p>
      </section>

      {/* Quiet maintenance utility — pulled out of the header so it doesn't
          compete with the cohort signal. */}
      <details className="console-disclosure">
        <summary>
          <span>Media library<span className="console-disc-sub" style={{ marginLeft: 8 }}>maintenance</span></span>
          <svg className="console-disc-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
        </summary>
        <div className="console-disclosure-body">
          <p className="aurora-muted" style={{ margin: "8px 0 12px", lineHeight: 1.6 }}>
            Regenerate the illustrative accent artwork shown across the student app. Runs in the background — students are never blocked.
          </p>
          <button type="button" className="aurora-btn-ghost" onClick={refreshMedia}>↻ Refresh media library</button>
        </div>
      </details>
    </div>
  );
}
