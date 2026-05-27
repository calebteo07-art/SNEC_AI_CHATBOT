import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { CohortHeatmap } from "./CohortHeatmap";
import { AtRiskTable } from "./AtRiskTable";
import { StudentDrillDown } from "./StudentDrillDown";
import { Users, AlertTriangle, Activity, LogOut, Mail } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "./AuthContext";

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
  const { user } = useAuth();
  const [cohort, setCohort] = useState<CohortData | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkTopic[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<string | null>(null);
  const [digestSending, setDigestSending] = useState(false);
  const [digestStatus, setDigestStatus] = useState<"idle" | "sent" | "error">("idle");

  useEffect(() => {
    const supervisorHeaders = { "X-Supervisor-ID": user?.studentId || "" };

    Promise.all([
      fetch(`${API}/api/supervisor/cohort`, { headers: supervisorHeaders }).then((r) => r.json()),
      fetch(`${API}/api/supervisor/at-risk`, { headers: supervisorHeaders }).then((r) => r.json()),
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

    fetch(`${API}/api/supervisor/insights`, { headers: supervisorHeaders })
      .then((r) => r.json())
      .then((data) => setInsights(data.narrative))
      .catch(() => null);

    fetch(`${API}/api/supervisor/benchmarks`, { headers: supervisorHeaders })
      .then((r) => r.json())
      .then((data) => setBenchmarks(data.topics ?? []))
      .catch(() => null);
  }, [user]);

  function handleSendDigest() {
    if (digestSending || !user?.email) return;
    setDigestSending(true);
    setDigestStatus("idle");
    fetch(`${API}/api/supervisor/send-digest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Supervisor-ID": user?.studentId || "",
      },
      body: JSON.stringify({ recipient: user.email }),
    })
      .then((r) => { if (!r.ok) throw new Error(); })
      .then(() => setDigestStatus("sent"))
      .catch(() => setDigestStatus("error"))
      .finally(() => setDigestSending(false));
  }

  return (
    <div className="min-h-screen bg-[#FBF8F1]">
      {/* Top strip */}
      <motion.div
        className="border-b border-[#1F1A12]/8 bg-[#FBF8F1]/80 backdrop-blur-sm sticky top-0 z-30"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HolographicEyeLogo size={32} animated />
            <span
              className="text-[#1F1A12]"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.05rem",
                fontWeight: 500,
                letterSpacing: "-0.01em",
              }}
            >
              EyeBot
            </span>
            <span className="text-[#A39A8E]">·</span>
            <span className="text-[#5C544A]" style={{ fontSize: "0.85rem" }}>
              Supervisor
            </span>
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
                sessionStorage.clear();
                navigate("/");
              }}
              className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
            >
              <LogOut size={14} strokeWidth={1.5} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </motion.div>

      <div className="max-w-5xl mx-auto px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <p
            className="text-[#8C6D3F] mb-3"
            style={{ fontSize: "0.72rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
          >
            · Cohort overview
          </p>
          <h1
            className="text-[#1F1A12]"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2rem, 4vw, 3rem)",
              fontWeight: 400,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            How is your <span className="italic-display">cohort</span> doing?
          </h1>
        </motion.div>

        {loading && (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <p className="text-[#8B2D2D] text-center py-24" style={{ fontSize: "0.95rem" }}>
            {error}
          </p>
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
          />
        )}
      </AnimatePresence>
    </div>
  );
}
