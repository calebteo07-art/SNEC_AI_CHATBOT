import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import styles from '../../styles/animations.module.css';
import { useProgress } from "../../hooks/useProgress";
import type { ProgressData } from "../../hooks/useProgress";

type SessionEntry = ProgressData["sessions"][0];

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
  const { data, isLoading: loading, isError, refetch } = useProgress();

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

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="progress-two-col">

      {/* ── Left column: stats + calendar + focus areas ───── */}
      <div className="progress-left-col">
        {/* Compact header */}
        <div className={`progress-compact-header ${styles.fadeSlideIn} ${styles.item1}`} data-visible={visible ? 'true' : 'false'}>
          <div className="progress-compact-eyeline">SNEC Clinical Education</div>
          <div className="progress-compact-h1">My Progress</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
            {velocity === "improving" ? "↑ Improving" : velocity === "declining" ? "↓ Needs attention" : "→ Stable"}
          </div>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12 }}>
            <span className="spinner spinner--teal" />
            Loading…
          </div>
        )}
        {isError && (
          <div style={{ padding: "10px 12px", background: "var(--heart-bg)", border: "1px solid var(--heart)", borderRadius: "var(--r-sm)", color: "var(--heart)", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
            Could not load your progress. Please try again.
            <button onClick={() => refetch()} style={{ color: "var(--heart)", fontWeight: 700, fontSize: 11 }}>Retry</button>
          </div>
        )}

        {data && (
          <>
            {/* Compact stat rows */}
            <div className={`${styles.fadeSlideIn} ${styles.item2}`} data-visible={visible ? 'true' : 'false'}>
            {[
              { label: "Day Streak",     val: streak,       unit: "days", color: "var(--streak)" },
              { label: "Total Sessions", val: sessionCount,  unit: "",     color: "var(--teal)" },
              { label: "Avg Accuracy",   val: `${avgScore}%`, unit: "",   color: avgScore >= 80 ? "var(--emerald)" : avgScore >= 60 ? "var(--gold)" : "var(--heart)" },
              { label: "Topics Studied", val: topicPerf.length, unit: "", color: "var(--purple)" },
            ].map(s => (
              <div key={s.label} className="progress-stat-compact">
                <div className="progress-stat-compact-label">{s.label}</div>
                <div className="progress-stat-compact-val" style={{ color: s.color }}>
                  {s.val}{s.unit ? ` ${s.unit}` : ""}
                </div>
              </div>
            ))}
            </div>

            {/* 7-day calendar */}
            <div className={`streak-calendar ${styles.fadeSlideIn} ${styles.item3}`} data-visible={visible ? 'true' : 'false'}>
              <div className="cal-header">
                <p className="section-label" style={{ marginBottom: 0, fontSize: 9 }}>This Week</p>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>{weekHits.filter(Boolean).length}/7</span>
              </div>
              <div className="cal-day-labels">
                {DAY_LABELS.map((d, i) => <div key={i} className="cal-day-label">{d}</div>)}
              </div>
              <div className="cal-grid">
                {DAY_LABELS.map((d, i) => {
                  const dayOfWeek = (1 + i) % 7;
                  const isToday = dayOfWeek === today;
                  const isFuture = !weekHits[i] && i > today;
                  const hit = weekHits[i];
                  return (
                    <div key={i} className={`cal-day${hit ? (isToday ? " today" : " hit") : isFuture ? " future" : ""}`} aria-label={`${d}: ${hit ? "active" : "inactive"}`}>
                      {i + 1}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Focus areas */}
            {(data.weak_topics ?? []).length > 0 && (
              <div className={`${styles.fadeSlideIn} ${styles.item4}`} data-visible={visible ? 'true' : 'false'}>
                <p className="section-label" style={{ marginBottom: 8 }}>Focus Areas</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {data.weak_topics.map(t => (
                    <span key={t} style={{ padding: "4px 10px", borderRadius: "var(--r-full)", background: "var(--heart-bg)", border: "1px solid var(--heart)", fontSize: 10, fontWeight: 700, color: "var(--heart)" }}>
                      {topicLabel(t)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Right column: topic mastery ───────────────────── */}
      <div className="progress-right-col">
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12 }}>
            <span className="spinner spinner--teal" />
            Loading mastery data…
          </div>
        )}
        {data && topicPerf.length > 0 && (
          <>
            <p className={`section-label ${styles.fadeSlideIn} ${styles.item1}`} data-visible={visible ? 'true' : 'false'}>Topic Mastery</p>
            <div className={`${styles.fadeSlideIn} ${styles.item2}`} data-visible={visible ? 'true' : 'false'}>
            {[...topicPerf]
              .sort((a, b) => b.score - a.score)
              .map(({ topic, score }) => (
                <MasteryBar key={topic} topic={topic} score={score} />
              ))
            }
            </div>
          </>
        )}
        {data && topicPerf.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 40, color: "var(--faint)", fontSize: 13 }}>
            Complete a study session to see mastery data.
          </div>
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
