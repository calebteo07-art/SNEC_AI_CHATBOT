import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  BookOpen,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "./AuthContext";
import { SkeletonStatStrip, SkeletonLine } from "./SkeletonLoader";

interface TopicStat {
  topic: string;
  score: number;
}

interface SessionEntry {
  session_id: string;
  timestamp: string;
  topic: string;
  summary: string;
  mode: string;
}

interface ProgressData {
  session_count: number;
  streak: number;
  learning_velocity: "improving" | "stable" | "declining";
  weak_topics: string[];
  topic_performance: TopicStat[];
  sessions: SessionEntry[];
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "#4F6B3D" : pct >= 65 ? "#9C7B1F" : "#8B2D2D";
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div className="flex-1 h-[3px] rounded-full bg-[#1F1A12]/8 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span style={{ color, fontSize: "0.78rem", fontWeight: 600, minWidth: 36, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

function VelocityIcon({ v }: { v: string }) {
  if (v === "improving") return <TrendingUp size={14} strokeWidth={1.5} className="text-[#4F6B3D]" />;
  if (v === "declining") return <TrendingDown size={14} strokeWidth={1.5} className="text-[#8B2D2D]" />;
  return <Minus size={14} strokeWidth={1.5} className="text-[#A39A8E]" />;
}

export function ProgressScreen() {
  const navigate = useNavigate();
  const { authHeaders } = useAuth();

  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(() => {
    setError(null);
    setLoading(true);
    fetch("/api/progress", { headers: { ...authHeaders } })
      .then((r) => {
        if (!r.ok) throw new Error("Server error");
        return r.json();
      })
      .then((d: ProgressData) => setData(d))
      .catch(() => setError("We couldn't load your progress. Please try again."))
      .finally(() => setLoading(false));
  }, [authHeaders]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  return (
    <div className="min-h-screen aurora-bg relative overflow-hidden">
      {/* Top bar */}
      <motion.div
        className="glass-nav sticky top-0 z-30"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-3xl mx-auto px-8 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
          >
            <ArrowLeft size={15} strokeWidth={1.5} />
            Dashboard
          </button>
          <div className="flex items-center gap-3">
            <HolographicEyeLogo size={28} animated={false} />
            <span
              className="text-[#1F1A12]"
              style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 500, letterSpacing: "-0.01em" }}
            >
              EyeBot
            </span>
            <span className="text-[#A39A8E]">·</span>
            <span className="text-[#5C544A]" style={{ fontSize: "0.85rem" }}>My Progress</span>
          </div>
          <div className="w-20" />
        </div>
      </motion.div>

      <motion.div
        className="max-w-3xl mx-auto px-8 py-16"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <p className="text-[#8C6D3F] mb-3" style={{ fontSize: "0.72rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}>
          · Learning analytics
        </p>
        <h2
          className="text-[#1F1A12]"
          style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 400, lineHeight: 1.05, letterSpacing: "-0.02em" }}
        >
          My <span className="italic-display">Progress</span>
        </h2>

        {/* Loading */}
        {loading && (
          <div>
            <SkeletonStatStrip />
            <div className="mt-12 space-y-3">
              <SkeletonLine widthClass="w-1/4" heightClass="h-3" />
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <SkeletonLine widthClass="w-32" heightClass="h-3" />
                  <SkeletonLine widthClass="flex-1" heightClass="h-4" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-10 flex items-center justify-between gap-3 px-5 py-4 rounded-xl bg-[#8B2D2D]/5 border border-[#8B2D2D]/20 text-[#8B2D2D]">
            <div className="flex items-center gap-3">
              <AlertCircle size={16} strokeWidth={1.5} />
              <span style={{ fontSize: "0.9rem" }}>{error}</span>
            </div>
            <button
              onClick={fetchProgress}
              className="flex-shrink-0 text-[#8B2D2D] underline underline-offset-2 hover:opacity-70 transition-opacity"
              style={{ fontSize: "0.88rem", fontWeight: 500 }}
            >
              <RefreshCw size={13} strokeWidth={1.5} className="inline mr-1" />
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            {/* ── Stats strip ─────────────────────────────── */}
            <div className="mt-12 grid grid-cols-3 gap-4">
              {[
                { label: "Sessions", value: String(data.session_count), icon: <BookOpen size={14} strokeWidth={1.5} className="text-[#8C6D3F]" /> },
                { label: "Day streak", value: String(data.streak), icon: <Flame size={14} strokeWidth={1.5} className="text-[#8C6D3F]" /> },
                {
                  label: "Trend",
                  value: data.learning_velocity === "improving" ? "Improving" : data.learning_velocity === "declining" ? "Declining" : "Stable",
                  icon: <VelocityIcon v={data.learning_velocity} />,
                },
              ].map(({ label, value, icon }) => (
                <div key={label} className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-3">{icon}<span className="text-[#A39A8E]" style={{ fontSize: "0.7rem", letterSpacing: "0.16em", textTransform: "uppercase" }}>{label}</span></div>
                  <p className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 400 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* ── Weak topics ─────────────────────────────── */}
            {data.weak_topics.length > 0 && (
              <motion.section
                className="mt-12"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <p className="annotation-label mb-4">Focus areas · needs attention</p>
                <div className="flex flex-wrap gap-2">
                  {data.weak_topics.map((t) => (
                    <span
                      key={t}
                      className="px-4 py-1.5 rounded-full text-[#8B2D2D]"
                      style={{ fontSize: "0.78rem", fontWeight: 600, background: "rgba(139,45,45,0.07)", border: "1px solid rgba(139,45,45,0.18)" }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </motion.section>
            )}

            {/* ── Topic performance ───────────────────────── */}
            {data.topic_performance.length > 0 && (
              <motion.section
                className="mt-12"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-baseline justify-between mb-6">
                  <p className="annotation-label">Topic retention</p>
                  <span className="text-[#A39A8E]" style={{ fontSize: "0.72rem" }}>Worst → Best</span>
                </div>
                <div className="space-y-4">
                  {data.topic_performance.map(({ topic, score }, i) => (
                    <motion.div
                      key={topic}
                      className="flex items-center gap-5"
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <span
                        className="text-[#5C544A] truncate"
                        style={{ fontSize: "0.88rem", minWidth: 160, maxWidth: 200 }}
                        title={topic}
                      >
                        {topic}
                      </span>
                      <ScoreBar score={score} />
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}

            {data.topic_performance.length === 0 && data.sessions.length === 0 && (
              <p className="text-[#A39A8E] text-center py-16" style={{ fontSize: "0.92rem" }}>
                Complete a study session to see your progress here.
              </p>
            )}

            {/* ── Session history ─────────────────────────── */}
            {data.sessions.length > 0 && (
              <motion.section
                className="mt-12"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <p className="annotation-label mb-6">Recent sessions</p>
                <div className="space-y-2">
                  {data.sessions.map((s, i) => (
                    <motion.div
                      key={s.session_id || i}
                      className="glass-card p-5 flex items-start gap-5"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <div className="flex-shrink-0 text-[#A39A8E]" style={{ fontSize: "0.75rem", minWidth: 72 }}>
                        {s.timestamp}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#1F1A12] truncate" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                          {s.topic}
                        </p>
                        {s.summary && (
                          <p className="text-[#A39A8E] mt-1 line-clamp-2" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
                            {s.summary}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
