"use client";
/* AURORA Dashboard — the command centre. Gradient hero greeting + mono readouts,
   a Next-Best-Action card, three tonal stat cards (recall / mastery / due), and
   a recent-activity timeline. Real data from useProgress + curriculum. */
import Link from "next/link";
import { useAuth } from "@/screens/AuthContext";
import { ChangePasswordModal } from "@/screens/ChangePasswordModal";
import { useProgress } from "@/hooks/useProgress";
import { CURRICULUM, OA_TOPICS, OT_TOPICS, PSA_TOPICS, type Track } from "@/lib/legacy/curriculum";
import { GradientHero, type Readout } from "@/aurora/components/GradientHero";
import { StatCard } from "@/aurora/components/StatCard";
import { PlateWell } from "@/aurora/components/PlateWell";
import { ProgressBar } from "@/aurora/components/ProgressBar";
import { Sparkline } from "@/aurora/components/Sparkline";

const TRACK_TOPICS: Record<Track, typeof OA_TOPICS> = { OA: OA_TOPICS, OT: OT_TOPICS, PSA: PSA_TOPICS };
const TRACK_LABELS: Record<Track, string> = {
  OA: "Ophthalmic Assistant",
  OT: "Ophthalmic Technician",
  PSA: "Patient Service Associate",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function relativeDate(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff}d ago`;
}

export function Dashboard() {
  const { user, setMustChangePassword } = useAuth();
  const { data: progress } = useProgress();

  const activeTrack = ((user?.studentRole as Track) || "OA");
  const trackLabel = TRACK_LABELS[activeTrack] ?? "Trainee";
  const firstName = (user?.fullName ?? "there").split(" ")[0];

  const topics = TRACK_TOPICS[activeTrack] ?? OA_TOPICS;
  const perfFor = (id: string) => progress?.topic_performance?.find((p) => p.topic === id)?.score ?? 0;
  const completedIds = topics.filter((t) => perfFor(t.id) >= 0.65).map((t) => t.id);
  const nextTopic = topics.find((t) => !completedIds.includes(t.id)) ?? null;

  const masteryPct = Math.round((topics.reduce((s, t) => s + perfFor(t.id), 0) / Math.max(topics.length, 1)) * 100);
  const trendSeries = topics.map((t) => Math.round(perfFor(t.id) * 100));

  const weakTopics = progress?.weak_topics ?? [];
  const recall = weakTopics.length;
  const recentSessions = (progress?.sessions ?? []).slice(0, 6);

  const readouts: Readout[] = [
    { label: "Streak", value: `${progress?.streak ?? 0}d` },
    { label: "Rank", value: `Lv ${progress?.level ?? 1}` },
    { label: "XP", value: `${progress?.xp ?? 0}` },
  ];

  const nba = nextTopic
    ? { title: nextTopic.label, sub: `Continue your ${trackLabel} pathway`, cta: "Continue", href: `/flashcards?topic=${nextTopic.id}` }
    : { title: "All topics cleared", sub: "Sharpen weak areas or explore live cases", cta: "Open Cases", href: "/cases" };

  return (
    <div className="aurora-dash">
      {user?.mustChangePassword && (
        <ChangePasswordModal forced onSuccess={() => setMustChangePassword(false)} />
      )}

      <GradientHero
        eyebrow={`${trackLabel} · ${activeTrack} track`}
        title={`${greeting()}, ${firstName}`}
        readouts={readouts}
      />

      <div className="aurora-dash-grid">
        {/* Next-Best-Action */}
        <div className="aurora-card aurora-nba" data-testid="nba-card">
          <div className="aurora-nba-inner">
            <p className="aurora-nba-eyebrow">Next best action</p>
            <PlateWell alt={`${nba.title} reference eye`} ratio={2.4} />
            <p className="aurora-nba-title">{nba.title}</p>
            <p className="aurora-nba-sub">{nba.sub}</p>
            <Link href={nba.href} className="aurora-cta aurora-flow"><span>{nba.cta} →</span></Link>
          </div>
        </div>

        {/* Recall queue (blue) + sparkline */}
        <StatCard tone="blue" label="Recall queue" value={recall}>
          {trendSeries.length >= 2 ? <Sparkline data={trendSeries} /> : <p className="aurora-muted">No trend yet</p>}
        </StatCard>

        {/* Track mastery (purple) + progress */}
        <StatCard tone="purple" label={`${activeTrack} mastery`} value={`${masteryPct}%`}>
          <ProgressBar percent={masteryPct} label={`${activeTrack} mastery`} />
        </StatCard>

        {/* Due today (rose) list */}
        <StatCard tone="rose" label="Due today">
          {weakTopics.length > 0 ? (
            <ul className="aurora-rose-list">
              {weakTopics.slice(0, 4).map((t) => <li key={t}>{t}</li>)}
            </ul>
          ) : (
            <p className="aurora-muted">All clear — no recall due.</p>
          )}
        </StatCard>
      </div>

      {/* Recent activity */}
      <section className="aurora-card">
        <p className="aurora-activity-head">Recent activity</p>
        {recentSessions.length > 0 ? (
          <div className="aurora-activity">
            {recentSessions.map((s, i) => {
              const label = CURRICULUM.find((t) => t.id === s.topic)?.label ?? s.topic;
              return (
                <div key={s.session_id ?? i} className="aurora-activity-row">
                  <span className="aurora-activity-date">{relativeDate(s.timestamp)}</span>
                  <span className="aurora-activity-topic">{label}</span>
                  <span className="aurora-activity-mode">{s.mode}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="aurora-muted">No sessions yet — pick a topic above to begin.</p>
        )}
      </section>
    </div>
  );
}
