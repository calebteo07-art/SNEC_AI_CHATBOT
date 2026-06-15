"use client";
/* AURORA Progress — the diagnostic report, rebuilt calm. Tonal vitals, mastery
   bars by topic, an activity heatmap (gradient intensity), focus areas, and a
   session log. Real data from useProgress; colour only from the gradient. */
import { useEffect, useState } from "react";
import { useProgress } from "@/hooks/useProgress";
import { ACHIEVEMENTS, getUserProgress } from "@/lib/legacy/gamification";
import { useLeaderboard, useLeaderboardOptIn } from "@/hooks/useLeaderboard";
import { StatCard } from "@/aurora/components/StatCard";
import { ProgressBar } from "@/aurora/components/ProgressBar";
import { Sparkline } from "@/aurora/components/Sparkline";
import { Heatmap } from "@/aurora/components/Heatmap";
import { useCountUp } from "@/hooks/useCountUp";
import { Reveal } from "@/fx/Reveal";

function topicLabel(raw: string): string {
  return raw.replace(/_/g, " ").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function trackLabel(topic: string): string {
  const t = topic.toLowerCase();
  if (t.startsWith("ot")) return "OT";
  if (t.startsWith("psa")) return "PSA";
  return "OA";
}
function relativeDay(ts: string): string {
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}
function buildActivity(sessions: { timestamp: string }[], days = 35) {
  const counts = Array(days).fill(0) as number[];
  const now = Date.now();
  for (const s of sessions) {
    const diff = Math.floor((now - new Date(s.timestamp).getTime()) / 86_400_000);
    if (diff >= 0 && diff < days) counts[days - 1 - diff]++;
  }
  const max = Math.max(1, ...counts);
  return {
    values: counts.map((c) => (c === 0 ? 0 : 0.3 + 0.7 * (c / max))),
    active: counts.filter((c) => c > 0).length,
  };
}

export function Progress() {
  const { data, isLoading, isError, refetch } = useProgress();

  // Earned badges live in localStorage — read after mount to avoid an SSR mismatch.
  const [earned, setEarned] = useState<string[]>([]);
  useEffect(() => { setEarned(getUserProgress().achievements ?? []); }, []);

  // Cohort leaderboard (only shown when a supervisor has enabled it).
  const { data: lb } = useLeaderboard();
  const optIn = useLeaderboardOptIn();

  const topicPerf = data?.topic_performance ?? [];
  const topicsSorted = [...topicPerf].sort((a, b) => b.score - a.score);
  const trend = topicsSorted.map((t) => Math.round(t.score * 100));
  const avgScore = topicPerf.length
    ? Math.round((topicPerf.reduce((s, p) => s + p.score, 0) / topicPerf.length) * 100)
    : 0;
  const streak = data?.streak ?? 0;
  const sessionCount = data?.session_count ?? 0;
  const weak = data?.weak_topics ?? [];
  const sessions = (data?.sessions ?? []).slice(0, 10);
  // Weekly recap — sessions and distinct active days in the last 7 days.
  const weekAgo = Date.now() - 7 * 86_400_000;
  const weekSessions = (data?.sessions ?? []).filter((s) => new Date(s.timestamp).getTime() >= weekAgo);
  const weekDays = new Set(weekSessions.map((s) => new Date(s.timestamp).toDateString())).size;
  const { values: activity, active: activeDays } = buildActivity(data?.sessions ?? []);
  const velocity = data?.learning_velocity ?? "stable";
  const date = new Date()
    .toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();

  /* Animated count-ups for the vitals. */
  const streakCU = useCountUp<HTMLSpanElement>(streak);
  const sessionsCU = useCountUp<HTMLSpanElement>(sessionCount);
  const accuracyCU = useCountUp<HTMLSpanElement>(avgScore, { format: (n) => `${Math.round(n)}%` });
  const topicsCU = useCountUp<HTMLSpanElement>(topicPerf.length);

  return (
    <div className="aurora-prog">
      <header className="aurora-prog-head">
        <p className="aurora-eyebrow">SNEC clinical education · progress report</p>
        <h1 className="aurora-h1">Your progress</h1>
        <p className="aurora-sub">{date} · velocity {velocity}</p>
      </header>

      {isLoading && <p className="aurora-muted">Developing your report…</p>}
      {isError && (
        <div className="aurora-cases-error">
          Could not load your progress. Please try again.
          <button type="button" onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {data && (
        <>
          <div className="aurora-prog-stats aurora-stagger">
            <StatCard tone="blue" label="Day streak" value={<span ref={streakCU.ref}>{streakCU.display}</span>} />
            <StatCard tone="purple" label="Sessions" value={<span ref={sessionsCU.ref}>{sessionsCU.display}</span>} />
            <StatCard tone="rose" label="Avg accuracy" value={<span ref={accuracyCU.ref}>{accuracyCU.display}</span>}>
              {trend.length >= 2 && <Sparkline data={trend} />}
            </StatCard>
            <StatCard tone="blue" label="Topics" value={<span ref={topicsCU.ref}>{topicsCU.display}</span>} />
          </div>

          <section className="aurora-card" aria-label="This week">
            <p className="aurora-activity-head">This week</p>
            <p className="aurora-muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
              {weekSessions.length > 0
                ? `${weekSessions.length} session${weekSessions.length === 1 ? "" : "s"} across ${weekDays} active day${weekDays === 1 ? "" : "s"} in the last 7 days. ${weekDays >= 5 ? "Outstanding consistency — keep it up! 🔥" : weekDays >= 2 ? "Nice rhythm — a little each day adds up. 💪" : "A daily check-in or a Quick 5 deck keeps the momentum going. 🌱"}`
                : "No sessions yet this week — a Quick 5-card deck is a perfect restart. 🌱"}
            </p>
          </section>

          <section className="aurora-card aurora-prog-mastery" aria-label="Mastery by topic">
            <p className="aurora-activity-head">Mastery by topic</p>
            {topicsSorted.length > 0 ? (
              topicsSorted.map((t) => (
                <div key={t.topic} className="aurora-prog-row">
                  <div className="aurora-prog-row-head">
                    <span className="aurora-prog-topic">{topicLabel(t.topic)}</span>
                    <span className="aurora-prog-track">{trackLabel(t.topic)}</span>
                    <span className="aurora-prog-pct">{Math.round(t.score * 100)}%</span>
                  </div>
                  <ProgressBar percent={t.score * 100} label={topicLabel(t.topic)} />
                </div>
              ))
            ) : (
              <p className="aurora-muted">Complete a study session to chart your mastery.</p>
            )}
          </section>

          <Reveal><div className="aurora-prog-grid">
            <section className="aurora-card" aria-label="Recent activity">
              <div className="aurora-prog-card-head">
                <p className="aurora-activity-head">Activity · last 5 weeks</p>
                <span className="aurora-prog-count">{activeDays} active days</span>
              </div>
              <Heatmap values={activity} columns={7} />
            </section>

            <section className="aurora-card" aria-label="Focus areas">
              <p className="aurora-activity-head">Focus areas</p>
              {weak.length > 0 ? (
                <div className="aurora-prog-chips">
                  {weak.map((t) => <span key={t} className="aurora-prog-chip">{topicLabel(t)}</span>)}
                </div>
              ) : (
                <p className="aurora-muted">No weak areas flagged — nicely done.</p>
              )}
            </section>
          </div></Reveal>

          <section className="aurora-card" aria-label="Badge case">
            <div className="aurora-prog-card-head">
              <p className="aurora-activity-head">Badge case</p>
              <span className="aurora-prog-count">{earned.length}/{ACHIEVEMENTS.length} earned</span>
            </div>
            <div className="aurora-badges">
              {ACHIEVEMENTS.map((a) => {
                const got = earned.includes(a.id);
                return (
                  <div key={a.id} className={`aurora-badge${got ? "" : " is-locked"}`} title={a.description}>
                    <span className="aurora-badge-icon" aria-hidden>{got ? a.icon : "🔒"}</span>
                    <span className="aurora-badge-name">{a.name}</span>
                    <span className="aurora-badge-desc">{a.description}</span>
                  </div>
                );
              })}
            </div>
            <p className="aurora-muted" style={{ marginTop: 12, fontSize: 12 }}>
              Earn badges by reviewing flashcards and keeping your daily check-in streak alive.
            </p>
          </section>

          {lb?.enabled && (
            <section className="aurora-card" aria-label="Cohort leaderboard">
              <div className="aurora-prog-card-head">
                <p className="aurora-activity-head">Cohort leaderboard</p>
                {lb.opted_in && (
                  <button type="button" className="aurora-summary-link" onClick={() => optIn.mutate(false)} disabled={optIn.isPending}>
                    Leave
                  </button>
                )}
              </div>
              {!lb.opted_in ? (
                <>
                  <p className="aurora-muted" style={{ marginBottom: 12, lineHeight: 1.6 }}>
                    There&apos;s an optional cohort leaderboard. Join to see how your XP compares with classmates — you&apos;ll appear as your first name + last initial, and you can leave any time. It&apos;s just for a bit of friendly motivation.
                  </p>
                  <button type="button" className="aurora-cta aurora-flow aurora-press" style={{ maxWidth: 280 }} onClick={() => optIn.mutate(true)} disabled={optIn.isPending}>
                    <span>Join the leaderboard →</span>
                  </button>
                </>
              ) : lb.entries.length > 0 ? (
                <div className="aurora-lb">
                  {lb.entries.slice(0, 20).map((e) => (
                    <div key={e.rank} className={`aurora-lb-row${e.is_you ? " is-you" : ""}`}>
                      <span className="aurora-lb-rank">{e.rank}</span>
                      <span className="aurora-lb-name">{e.name}{e.is_you ? " · you" : ""}</span>
                      <span className="aurora-lb-lv">Lv {e.level}</span>
                      <span className="aurora-lb-xp">{e.xp.toLocaleString()} XP</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="aurora-muted">You&apos;re on the leaderboard — check back as classmates join.</p>
              )}
            </section>
          )}

          {sessions.length > 0 && (
            <section className="aurora-card" aria-label="Session log">
              <p className="aurora-activity-head">Session log</p>
              <div className="aurora-activity">
                {sessions.map((s, i) => (
                  <div key={s.session_id ?? i} className="aurora-activity-row">
                    <span className="aurora-activity-date">{relativeDay(s.timestamp)}</span>
                    <span className="aurora-activity-topic">{topicLabel(s.topic)}</span>
                    <span className="aurora-activity-mode">{s.mode}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
