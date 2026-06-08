import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CohortHeatmap } from "./CohortHeatmap";
import { AtRiskTable } from "./AtRiskTable";
import { StudentDrillDown } from "./StudentDrillDown";
import { Users, AlertTriangle, Activity, LogOut, Mail, RefreshCw, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import { SkeletonCard, SkeletonStatStrip } from "./SkeletonLoader";

const API = "";

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

export function SupervisorDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [cohort, setCohort] = useState<CohortData | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkTopic[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<string | null>(null);
  const [digestSending, setDigestSending] = useState(false);
  const [digestStatus, setDigestStatus] = useState<"idle" | "sent" | "error">("idle");

  const fetchData = React.useCallback(() => {
    setLoading(true);
    setError(null);
    setCohort(null);
    setAtRisk([]);
    setInsights(null);
    setBenchmarks([]);

    Promise.all([
      fetch(`${API}/api/supervisor/cohort`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API}/api/supervisor/at-risk`, { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([cohortData, atRiskData]) => {
        setCohort(cohortData);
        setAtRisk(atRiskData.students ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("We couldn't load the supervisor data.");
        setLoading(false);
      });

    fetch(`${API}/api/supervisor/insights`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setInsights(data.narrative))
      .catch(() => null);

    fetch(`${API}/api/supervisor/benchmarks`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setBenchmarks(data.topics ?? []))
      .catch(() => null);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSendDigest() {
    if (digestSending || !user?.email) return;
    setDigestSending(true);
    setDigestStatus("idle");
    fetch(`${API}/api/supervisor/send-digest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ recipient: user.email }),
    })
      .then((r) => { if (!r.ok) throw new Error(); })
      .then(() => setDigestStatus("sent"))
      .catch(() => setDigestStatus("error"))
      .finally(() => setDigestSending(false));
  }

  return (
    <div className="admin-layout">
      {/* Top strip */}
      <div style={{ borderBottom: "1px solid var(--border)", background: "var(--card)", position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 52, flexShrink: 0, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>Supervisor</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>· Cohort Analytics</span>
        </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleSendDigest}
              disabled={digestSending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#8C6D3F]/30 text-[#8C6D3F] hover:bg-[#8C6D3F]/6 transition-colors disabled:opacity-50 text-sm"
              title="Send weekly digest to your email"
            >
              {digestSending
                ? <div className="w-3 h-3 border border-[#8C6D3F]/30 border-t-[#8C6D3F] rounded-full animate-spin" />
                : <Mail size={13} strokeWidth={1.5} />
              }
              <span className="hidden sm:inline">
                {digestStatus === "sent" ? "Sent!" : digestStatus === "error" ? "Failed" : "Send digest"}
              </span>
            </button>
            <button
              onClick={() => {
                logout();
                navigate("/");
              }}
              className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
            >
              <LogOut size={14} strokeWidth={1.5} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
      </div>

      <div>
        <div>
          <h1 className="admin-title">Cohort Overview</h1>
          <p className="admin-sub">How is your cohort performing?</p>
        </div>

        {loading && (
          <div>
            <SkeletonStatStrip />
            <div className="mt-12 space-y-4">
              <SkeletonCard rows={3} />
              <SkeletonCard rows={2} />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-10 flex items-center justify-between gap-3 px-5 py-4 rounded-xl bg-[#8B2D2D]/5 border border-[#8B2D2D]/20 text-[#8B2D2D]">
            <div className="flex items-center gap-3">
              <AlertCircle size={16} strokeWidth={1.5} aria-hidden="true" />
              <span style={{ fontSize: "0.9rem" }}>{error}</span>
            </div>
            <button
              onClick={fetchData}
              className="flex-shrink-0 text-[#8B2D2D] underline underline-offset-2 hover:opacity-70 transition-opacity inline-flex items-center gap-1"
              style={{ fontSize: "0.88rem", fontWeight: 500 }}
            >
              <RefreshCw size={13} strokeWidth={1.5} />
              Retry
            </button>
          </div>
        )}

        {cohort && (
          <div className="mt-12 space-y-12">
            {/* AI cohort narrative */}
            {insights && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <blockquote
                  className="text-[#1F1A12] italic-display border-l-2 border-[#8C6D3F]/40 pl-6 max-w-3xl"
                  style={{ fontSize: "1.2rem", lineHeight: 1.55, fontWeight: 400 }}
                >
                  "{insights}"
                </blockquote>
              </motion.div>
            )}

            {/* KPI row */}
            <div className="grid grid-cols-3 gap-px bg-[#1F1A12]/8 border border-[#1F1A12]/8 rounded-2xl overflow-hidden">
              {[
                { icon: Users, label: "Students", value: cohort.total, tone: "#8C6D3F" },
                { icon: Activity, label: "Active this week", value: cohort.active_this_week, tone: "#4F6B3D" },
                {
                  icon: AlertTriangle,
                  label: "At risk",
                  value: cohort.at_risk_count,
                  tone: cohort.at_risk_count > 0 ? "#8B2D2D" : "#4F6B3D",
                },
              ].map(({ icon: Icon, label, value, tone }, idx) => (
                <motion.div
                  key={label}
                  className="bg-white px-8 py-7"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + idx * 0.06 }}
                >
                  <Icon size={18} strokeWidth={1.25} style={{ color: tone }} className="mb-5" />
                  <p
                    className="text-[#A39A8E] mb-2"
                    style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
                  >
                    {label}
                  </p>
                  <p
                    className="text-[#1F1A12]"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "2.4rem",
                      fontWeight: 400,
                      lineHeight: 1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {value}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Heatmap */}
            <div className="surface-card-lg p-8">
              <p
                className="text-[#8C6D3F] mb-6"
                style={{ fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
              >
                · Topic weaknesses
              </p>
              <CohortHeatmap topics={cohort.weakest_topics} retentionByTopic={{}} />
              {cohort.weakest_topics.length === 0 && (
                <p className="text-[#A39A8E]" style={{ fontSize: "0.92rem" }}>
                  No weak topics recorded yet.
                </p>
              )}
            </div>

            {/* Batch alert */}
            {(() => {
              const failingTopics = benchmarks.filter(b => b.avg_score < 0.5);
              if (failingTopics.length === 0) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-start gap-3 px-5 py-4 rounded-xl bg-[#8B2D2D]/5 border border-[#8B2D2D]/20 text-[#8B2D2D]"
                >
                  <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                  <div>
                    <p style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {failingTopics.length} topic{failingTopics.length !== 1 ? "s" : ""} below 50% cohort average
                    </p>
                    <p style={{ fontSize: "0.78rem", marginTop: 2, opacity: 0.85 }}>
                      {failingTopics.map(b => b.topic.replace(/_/g, " ")).join(" · ")}
                    </p>
                  </div>
                </motion.div>
              );
            })()}

            {/* Cohort benchmarks */}
            {benchmarks.length > 0 && (
              <div className="surface-card-lg p-8">
                <p
                  className="text-[#8C6D3F] mb-6"
                  style={{ fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
                >
                  · Cohort benchmarks
                </p>
                <div className="space-y-3">
                  {benchmarks.map((b, idx) => {
                    const pct = Math.round(b.avg_score * 100);
                    const barColor = pct >= 75 ? "#4F6B3D" : pct >= 50 ? "#8C6D3F" : "#8B2D2D";
                    const bgColor = pct >= 75 ? "#4F6B3D14" : pct >= 50 ? "#8C6D3F14" : "#8B2D2D14";
                    return (
                      <motion.div
                        key={b.topic}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: idx * 0.04 }}
                        className="flex items-center gap-4"
                      >
                        <span
                          className="text-[#5C544A] shrink-0 w-44 truncate text-right"
                          style={{ fontSize: "0.82rem" }}
                          title={b.topic.replace(/_/g, " ")}
                        >
                          {b.topic.replace(/_/g, " ")}
                        </span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: bgColor }}>
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: barColor }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, delay: 0.1 + idx * 0.04, ease: "easeOut" }}
                          />
                        </div>
                        <span
                          className="shrink-0 tabular-nums"
                          style={{ fontSize: "0.82rem", color: barColor, fontWeight: 600, minWidth: "2.8rem" }}
                        >
                          {pct}%
                        </span>
                        <span
                          className="shrink-0 text-[#A39A8E]"
                          style={{ fontSize: "0.75rem", minWidth: "4rem" }}
                        >
                          {b.student_count} student{b.student_count !== 1 ? "s" : ""}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* At-risk table */}
            <div className="surface-card-lg p-8">
              <p
                className="text-[#8C6D3F] mb-6"
                style={{ fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
              >
                · Students needing attention
              </p>
              <AtRiskTable students={atRisk} onSelectStudent={setSelectedStudent} />
            </div>
          </div>
        )}
      </div>

      {/* Student drill-down modal */}
      <AnimatePresence>
        {selectedStudent && (
          <StudentDrillDown
            studentId={selectedStudent}
            onClose={() => setSelectedStudent(null)}
            benchmarks={benchmarks}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
