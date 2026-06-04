import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

/* ── Types (preserved from original) ─────────────────────── */
interface TopicStat    { topic: string; score: number; }
interface SessionEntry { session_id: string; timestamp: string; topic: string; summary: string; mode: string; }

interface ProgressData {
  session_count: number;
  streak: number;
  learning_velocity: "improving" | "stable" | "declining";
  weak_topics: string[];
  topic_performance: TopicStat[];
  sessions: SessionEntry[];
}

/* ── Helpers ──────────────────────────────────────────────── */
function buildWeekHits(sessions: SessionEntry[]): boolean[] {
  const hits = Array(7).fill(false) as boolean[];
  const now = new Date();
  sessions.forEach(s => {
    const diff = Math.floor((now.getTime() - new Date(s.timestamp).getTime()) / 86_400_000);
    if (diff >= 0 && diff < 7) hits[6 - diff] = true;
  });
  return hits;
}

function topicLabel(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function trackColor(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("ot-") || t.startsWith("ot"))  return "var(--purple)";
  if (t.includes("psa-") || t.startsWith("psa")) return "var(--emerald)";
  return "var(--teal)";
}

function trackBg(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("ot-") || t.startsWith("ot"))  return "var(--purple-bg)";
  if (t.includes("psa-") || t.startsWith("psa")) return "var(--emerald-bg)";
  return "var(--teal-bg)";
}

function trackLabel(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("ot-") || t.startsWith("ot"))  return "OT";
  if (t.includes("psa-") || t.startsWith("psa")) return "PSA";
  return "OA";
}

/* ── Animated mastery bar ─────────────────────────────────── */
function MasteryBar({ topic, score }: { topic: string; score: number }) {
  const pct = Math.round(score * 100);
  const color = trackColor(topic);
  const bg    = trackBg(topic);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="mastery-row" ref={ref}>
      <div className="mastery-icon-badge" style={{ background: bg }}>
        <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
          <ellipse cx="14" cy="14" rx="9" ry="6" stroke={color} strokeWidth="1.8" />
          <circle cx="14" cy="14" r="3.5" fill={color} />
        </svg>
      </div>
      <div className="mastery-info">
        <div className="mastery-name">{topicLabel(topic)}</div>
        <div className="mastery-track-label">{trackLabel(topic)} Track</div>
      </div>
      <div className="mastery-bar-track">
        <motion.div
          className="mastery-bar-fill"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: visible ? `${pct}%` : 0 }}
          transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1], delay: 0.1 }}
        />
      </div>
      <div className="mastery-pct" style={{ color }}>{pct}%</div>
    </div>
  );
}

/* ── ProgressScreen ───────────────────────────────────────── */
export function ProgressScreen() {
  const [data, setData]       = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchProgress = useCallback(() => {
    setError(null);
    setLoading(true);
    fetch("/api/progress", { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error("Server error"); return r.json(); })
      .then((d: ProgressData) => setData(d))
      .catch(() => setError("Could not load your progress. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const weekHits    = buildWeekHits(data?.sessions ?? []);
  const sessionCount = data?.session_count ?? 0;
  const streak      = data?.streak ?? 0;
  const topicPerf   = data?.topic_performance ?? [];
  const avgScore    = topicPerf.length > 0
    ? Math.round((topicPerf.reduce((s, p) => s + p.score, 0) / topicPerf.length) * 100)
    : 0;
  const velocity    = data?.learning_velocity ?? "stable";

  const DAY_LABELS  = ["M", "T", "W", "T", "F", "S", "S"];
  const today       = new Date().getDay(); // 0=Sun

  return (
    <div className="screen-progress">
      {/* ── Cinematic hero ────────────────────────────────── */}
      <div className="progress-hero">
        <img className="progress-hero-bg" src="/anatomy/eye-innovation.png" alt="" aria-hidden="true" />
        <div className="progress-hero-overlay">
          <div className="progress-hero-left">
            <div className="progress-hero-eyeline">SNEC Clinical Education</div>
            <h1 className="progress-hero-h1">My Progress</h1>
            <div className="progress-hero-sub">
              {velocity === "improving" ? "↑ Improving" : velocity === "declining" ? "↓ Needs attention" : "→ Stable"}
            </div>
          </div>
          <div className="progress-hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-value">{streak}</div>
              <div className="hero-stat-label">Streak</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">{sessionCount}</div>
              <div className="hero-stat-label">Sessions</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">{avgScore}%</div>
              <div className="hero-stat-label">Accuracy</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">{topicPerf.length}</div>
              <div className="hero-stat-label">Topics</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────── */}
      <div className="progress-body">

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 13 }}>
            <span className="spinner spinner--teal" />
            Loading your data…
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: "14px 16px", background: "var(--heart-bg)", border: "1px solid var(--heart)", borderRadius: "var(--r-md)", color: "#991b1b", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {error}
            <button onClick={fetchProgress} style={{ color: "var(--heart)", fontWeight: 700, fontSize: 12 }}>Retry</button>
          </div>
        )}

        {data && (
          <>
            {/* ── Stats grid ──────────────────────────────── */}
            <div className="stats-grid">
              <StatCard
                icon="🔥" iconBg="var(--streak-bg)" iconColor="var(--streak)"
                value={streak} label="Day Streak"
                delta={streak > 0 ? `${streak} day${streak !== 1 ? "s" : ""} running` : "Start today"}
                deltaColor="var(--streak)"
              />
              <StatCard
                icon="⚡" iconBg="var(--teal-bg)" iconColor="var(--teal)"
                value={sessionCount} label="Total Sessions"
                delta={sessionCount > 0 ? "Keep it up" : "Start your first session"}
                deltaColor="var(--teal)"
              />
              <StatCard
                icon="🎯" iconBg={avgScore >= 80 ? "var(--emerald-bg)" : avgScore >= 60 ? "#fffbeb" : "var(--heart-bg)"}
                iconColor={avgScore >= 80 ? "var(--emerald)" : avgScore >= 60 ? "var(--gold)" : "var(--heart)"}
                value={avgScore} label="Avg Accuracy" suffix="%"
                delta={avgScore >= 80 ? "Excellent" : avgScore >= 60 ? "Good progress" : "Keep practising"}
                deltaColor={avgScore >= 80 ? "var(--emerald)" : avgScore >= 60 ? "var(--gold)" : "var(--heart)"}
              />
            </div>

            {/* ── Streak calendar ─────────────────────────── */}
            <div className="streak-calendar">
              <div className="cal-header">
                <p className="section-label" style={{ marginBottom: 0 }}>This Week</p>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {weekHits.filter(Boolean).length} / 7 days active
                </span>
              </div>
              <div className="cal-day-labels">
                {DAY_LABELS.map((d, i) => <div key={i} className="cal-day-label">{d}</div>)}
              </div>
              <div className="cal-grid">
                {DAY_LABELS.map((d, i) => {
                  const dayOfWeek = (1 + i) % 7; // Mon=1..Sun=0
                  const isToday   = dayOfWeek === today;
                  const isFuture  = !weekHits[i] && i > today;
                  const hit = weekHits[i];
                  return (
                    <div
                      key={i}
                      className={`cal-day${hit ? (isToday ? " today" : " hit") : isFuture ? " future" : ""}`}
                      aria-label={`${d}: ${hit ? "active" : "inactive"}`}
                    >
                      {i + 1}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Topic mastery ───────────────────────────── */}
            {topicPerf.length > 0 && (
              <div className="mastery-section">
                <img className="mastery-deco" src="/anatomy/eye-nerve.png" alt="" aria-hidden="true" />
                <p className="section-label">Topic Mastery</p>
                {[...topicPerf]
                  .sort((a, b) => b.score - a.score)
                  .map(({ topic, score }) => (
                    <MasteryBar key={topic} topic={topic} score={score} />
                  ))
                }
              </div>
            )}

            {/* ── Weak topics ─────────────────────────────── */}
            {(data.weak_topics ?? []).length > 0 && (
              <div className="card" style={{ padding: 18 }}>
                <p className="section-label">Focus Areas</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {data.weak_topics.map(t => (
                    <span
                      key={t}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "var(--r-full)",
                        background: "var(--heart-bg)",
                        border: "1px solid var(--heart)",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#991b1b",
                      }}
                    >
                      {topicLabel(t)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Stat card ────────────────────────────────────────────── */
function StatCard({
  icon, iconBg, iconColor, value, label, suffix = "", delta, deltaColor,
}: {
  icon: string; iconBg: string; iconColor: string;
  value: number; label: string; suffix?: string;
  delta: string; deltaColor: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon" style={{ background: iconBg }}>
        <span style={{ fontSize: 18 }} role="img" aria-hidden="true">{icon}</span>
      </div>
      <div className="stat-card-value" style={{ color: iconColor }}>
        {value}{suffix}
      </div>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-delta" style={{ color: deltaColor }}>{delta}</div>
    </div>
  );
}
