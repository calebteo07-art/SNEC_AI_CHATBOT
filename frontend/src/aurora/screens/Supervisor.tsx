"use client";
/* AURORA supervisor — cohort analytics: KPIs, AI narrative, weak-topic chips,
   cohort benchmarks, an at-risk table, and a weekly-digest send. Student rows
   open the drill-down modal. Same endpoints as the legacy dashboard. */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/screens/AuthContext";
import { StatCard } from "@/aurora/components/StatCard";
import { SupervisorDrillDown, type BenchmarkTopic } from "./SupervisorDrillDown";

interface Cohort { total?: number; total_students?: number; active_this_week: number; at_risk_count: number; weakest_topics: string[]; }
interface AtRiskStudent { student_id: string; last_active: string; days_inactive: number; weak_topics: string[]; weak_count: number; }

export function Supervisor() {
  const { user } = useAuth();
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkTopic[]>([]);
  const [insights, setInsights] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [digestStatus, setDigestStatus] = useState<"idle" | "sent" | "error">("idle");
  const [lbEnabled, setLbEnabled] = useState<boolean | null>(null);
  const [lbSaving, setLbSaving] = useState(false);
  const [lbError, setLbError] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true); setError(false);
    Promise.all([
      fetch("/api/supervisor/cohort", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/supervisor/at-risk", { credentials: "include" }).then((r) => r.json()),
    ]).then(([c, a]) => { setCohort(c); setAtRisk(a.students ?? []); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    fetch("/api/supervisor/insights", { credentials: "include" }).then((r) => r.json()).then((d) => setInsights(d.narrative ?? d.insight ?? null)).catch(() => null);
    fetch("/api/supervisor/benchmarks", { credentials: "include" }).then((r) => r.json()).then((d) => setBenchmarks(d.topics ?? [])).catch(() => null);
    fetch("/api/supervisor/leaderboard", { credentials: "include" }).then((r) => r.json()).then((d) => setLbEnabled(!!d.enabled)).catch(() => setLbEnabled(false));
  }, []);

  const toggleLeaderboard = () => {
    if (lbSaving || lbEnabled === null) return;
    const next = !lbEnabled;
    setLbSaving(true); setLbError(false);
    fetch("/api/supervisor/leaderboard", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ enabled: next }),
    }).then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setLbEnabled(!!d.enabled))
      .catch(() => setLbError(true))
      .finally(() => setLbSaving(false));
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  const sendDigest = () => {
    if (digestSending || !user?.email) return;
    setDigestSending(true); setDigestStatus("idle");
    fetch("/api/supervisor/send-digest", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ recipient: user.email }),
    }).then((r) => { if (!r.ok) throw new Error(); }).then(() => setDigestStatus("sent")).catch(() => setDigestStatus("error")).finally(() => setDigestSending(false));
  };

  const failing = benchmarks.filter((b) => b.avg_score < 0.5);
  const totalStudents = cohort?.total ?? cohort?.total_students ?? 0;

  return (
    <div className="aurora-admin">
      <header className="aurora-admin-head">
        <div>
          <p className="aurora-eyebrow">SNEC clinical education · cohort analytics</p>
          <h1 className="aurora-h1">Supervisor</h1>
        </div>
        <button type="button" className="aurora-btn-ghost" onClick={sendDigest} disabled={digestSending}>
          {digestSending ? "Sending…" : digestStatus === "sent" ? "Digest sent ✓" : digestStatus === "error" ? "Failed — retry" : "✉ Send weekly digest"}
        </button>
      </header>

      {loading && <p className="aurora-muted">Loading cohort…</p>}
      {error && (
        <div className="aurora-cases-error">
          We couldn’t load the supervisor data.
          <button type="button" onClick={fetchData}>Retry</button>
        </div>
      )}

      {cohort && (
        <>
          {insights && <div className="aurora-insight"><p>“{insights}”</p></div>}

          <div className="aurora-kpis">
            <StatCard tone="blue" label="Students" value={totalStudents} />
            <StatCard tone="purple" label="Active this week" value={cohort.active_this_week} />
            <StatCard tone="rose" label="At risk" value={cohort.at_risk_count} />
          </div>

          {failing.length > 0 && (
            <div className="aurora-cases-error" style={{ display: "block" }}>
              <strong>{failing.length} topic{failing.length !== 1 ? "s" : ""} below 50% cohort average</strong>
              <div style={{ marginTop: 4, fontSize: 12 }}>{failing.map((b) => b.topic.replace(/_/g, " ")).join(" · ")}</div>
            </div>
          )}

          <section className="aurora-card" aria-label="Topic weaknesses">
            <p className="aurora-activity-head">Topic weaknesses</p>
            {cohort.weakest_topics.length === 0 ? (
              <p className="aurora-muted">No weak topics recorded yet.</p>
            ) : (
              <div className="aurora-prog-chips">
                {cohort.weakest_topics.map((t) => <span key={t} className="aurora-prog-chip">{t.replace(/_/g, " ")}</span>)}
              </div>
            )}
          </section>

          {benchmarks.length > 0 && (
            <section className="aurora-card" aria-label="Cohort benchmarks">
              <p className="aurora-activity-head">Cohort benchmarks</p>
              <div className="aurora-bars">
                {benchmarks.map((b) => {
                  const pct = Math.round(b.avg_score * 100);
                  return (
                    <div key={b.topic} className="aurora-bar-row">
                      <span className="aurora-bar-label">{b.topic.replace(/_/g, " ")}</span>
                      <span className="aurora-bar-track"><span className="aurora-bar-fill" data-weak={pct < 50} style={{ width: `${pct}%` }} /></span>
                      <span className="aurora-bar-pct">{pct}%</span>
                      <span className="aurora-bar-meta">{b.student_count} student{b.student_count !== 1 ? "s" : ""}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="aurora-card" aria-label="Cohort leaderboard">
            <div className="aurora-prog-card-head">
              <p className="aurora-activity-head">Cohort leaderboard</p>
              <button
                type="button"
                className={`aurora-topic-chip${lbEnabled ? " is-active" : ""}`}
                onClick={toggleLeaderboard}
                disabled={lbSaving || lbEnabled === null}
                aria-pressed={!!lbEnabled}
              >
                {lbEnabled === null ? "…" : lbEnabled ? "On" : "Off"}
              </button>
            </div>
            <p className="aurora-muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
              {lbEnabled
                ? "On — students can optionally join. Only students who choose to join appear, shown as first name + last initial, so no one is listed without consent."
                : "You've turned the leaderboard off, so it's hidden from all students. Turn it back on to let them optionally join a friendly cohort XP leaderboard."}
            </p>
            {lbError && (
              <p className="aurora-muted" style={{ marginTop: 6, color: "var(--on-rose)" }}>
                Couldn&apos;t update — the leaderboard tables may need database migration 004.
              </p>
            )}
          </section>

          <section className="aurora-card" aria-label="Students needing attention" style={{ padding: 0 }}>
            <p className="aurora-activity-head" style={{ padding: "16px 16px 0" }}>Students needing attention</p>
            {atRisk.length === 0 ? (
              <p className="aurora-tempty">Everyone is on track.</p>
            ) : (
              <div style={{ padding: 12 }}>
                <div className="aurora-table-wrap">
                  <div className="aurora-trow aurora-thead" style={{ gridTemplateColumns: "1fr 90px 110px 1.4fr" }}>
                    <span>Student</span><span>Inactive</span><span>Last active</span><span>Weak topics</span>
                  </div>
                  {atRisk.map((s) => (
                    <div key={s.student_id} className="aurora-trow is-clickable" style={{ gridTemplateColumns: "1fr 90px 110px 1.4fr" }} onClick={() => setSelected(s.student_id)}>
                      <span className="aurora-tcell" style={{ fontWeight: 500 }}>{s.student_id.slice(0, 8)}…</span>
                      <span className="aurora-tcell is-mono" style={{ color: "var(--on-rose)" }}>{s.days_inactive}d</span>
                      <span className="aurora-tcell is-muted">{s.last_active?.slice(0, 10) || "—"}</span>
                      <span className="aurora-tcell">{s.weak_topics.slice(0, 3).map((t) => t.replace(/_/g, " ")).join(", ")}{s.weak_topics.length > 3 ? ` +${s.weak_topics.length - 3}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {selected && <SupervisorDrillDown studentId={selected} benchmarks={benchmarks} onClose={() => setSelected(null)} />}
    </div>
  );
}
