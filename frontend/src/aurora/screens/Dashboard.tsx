"use client";
/* AURORA Dashboard — the command centre. Gradient hero greeting + readouts, a
   bold Next-Best-Action band, three saturated colour stat cards (recall /
   mastery / due) with big numbers, and a clean recent-activity list. Real data
   from useProgress + curriculum. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/screens/AuthContext";
import { ChangePasswordModal } from "@/screens/ChangePasswordModal";
import { useProgress } from "@/hooks/useProgress";
import { useDueCount } from "@/hooks/useFlashcards";
import { CURRICULUM, OA_TOPICS, OT_TOPICS, PSA_TOPICS, type Track } from "@/lib/legacy/curriculum";
import { GradientHero, type Readout } from "@/aurora/components/GradientHero";
import { GoalRing } from "@/aurora/components/GoalRing";
import { rankForLevel } from "@/lib/rank";
import { getDailyXp, DAILY_XP_GOAL } from "@/lib/legacy/gamification";
import { useCountUp } from "@/hooks/useCountUp";

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
  const { data: dueCount = 0 } = useDueCount();   // SM-2 cards due for review today (F1)

  // Today's XP toward the daily goal — read after mount to avoid an SSR/localStorage mismatch.
  const [dailyXp, setDailyXp] = useState(0);
  useEffect(() => { setDailyXp(getDailyXp()); }, []);

  const activeTrack = ((user?.studentRole as Track) || "OA");
  const trackLabel = TRACK_LABELS[activeTrack] ?? "Trainee";
  const firstName = (user?.fullName ?? "there").split(" ")[0];

  const topics = TRACK_TOPICS[activeTrack] ?? OA_TOPICS;
  const perfFor = (id: string) => progress?.topic_performance?.find((p) => p.topic === id)?.score ?? 0;
  const completedIds = topics.filter((t) => perfFor(t.id) >= 0.65).map((t) => t.id);
  const nextTopic = topics.find((t) => !completedIds.includes(t.id)) ?? null;

  const masteryPct = Math.round((topics.reduce((s, t) => s + perfFor(t.id), 0) / Math.max(topics.length, 1)) * 100);

  const weakTopics = progress?.weak_topics ?? [];
  const recall = weakTopics.length;
  const recentSessions = (progress?.sessions ?? []).slice(0, 6);

  /* Animated count-ups for the headline stat values. */
  const recallCU = useCountUp<HTMLSpanElement>(recall);
  const masteryCU = useCountUp<HTMLSpanElement>(masteryPct, { format: (n) => `${Math.round(n)}%` });
  const dueCU = useCountUp<HTMLSpanElement>(dueCount);

  const rank = rankForLevel(progress?.level ?? 1);
  const readouts: Readout[] = [
    { label: "Streak", value: `${progress?.streak ?? 0}d`, hint: "Your daily streak — complete the daily check-in each day to keep it alive." },
    {
      label: rank.title,
      value: `Lv ${progress?.level ?? 1}`,
      hint: rank.nextTitle ? `${rank.levelsToNext} level${rank.levelsToNext === 1 ? "" : "s"} to ${rank.nextTitle}` : "Top rank reached — nice work!",
    },
    { label: "XP", value: `${progress?.xp ?? 0}`, hint: "Experience points — earn them from flashcards, cases and the tutor. 500 XP per level." },
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
        action={
          <GoalRing
            onDark
            value={dailyXp}
            goal={DAILY_XP_GOAL}
            caption={dailyXp >= DAILY_XP_GOAL ? "Daily goal done! 🎉" : `${dailyXp} / ${DAILY_XP_GOAL} XP today`}
          />
        }
      />

      {/* Primary action — bold, clean band with a big title + gradient CTA */}
      <div className="aurora-card aurora-nba" data-testid="nba-card">
        <div className="aurora-nba-inner">
          <div className="aurora-nba-text">
            <p className="aurora-nba-eyebrow">Next best action</p>
            <p className="aurora-nba-title">{nba.title}</p>
            <p className="aurora-nba-sub">{nba.sub}</p>
          </div>
          <Link href={nba.href} className="aurora-cta aurora-flow aurora-press"><span>{nba.cta} →</span></Link>
        </div>
      </div>

      {/* Three saturated colour stat cards with big numbers */}
      <div className="aurora-bigstats aurora-stagger">
        <div className="aurora-bigstat" data-tone="blue" data-testid="stat-card">
          <p className="aurora-bigstat-label">Recall queue</p>
          <p className="aurora-bigstat-value"><span ref={recallCU.ref}>{recallCU.display}</span></p>
          <p className="aurora-bigstat-foot">{recall > 0 ? "weak topics to revisit" : "nothing flagged — nice work"}</p>
        </div>

        <div className="aurora-bigstat" data-tone="purple" data-testid="stat-card">
          <p className="aurora-bigstat-label">{activeTrack} mastery</p>
          <p className="aurora-bigstat-value"><span ref={masteryCU.ref}>{masteryCU.display}</span></p>
          <p className="aurora-bigstat-foot">{completedIds.length} of {topics.length} topics cleared</p>
        </div>

        <div className="aurora-bigstat" data-tone="rose" data-testid="stat-card">
          <p className="aurora-bigstat-label">Due today</p>
          <p className="aurora-bigstat-value"><span ref={dueCU.ref}>{dueCU.display}</span></p>
          {dueCount > 0 ? (
            <Link href="/flashcards?mode=review" className="aurora-bigstat-cta">Review now →</Link>
          ) : (
            <p className="aurora-bigstat-foot">{weakTopics.length > 0 ? `brush up: ${weakTopics[0]}` : "all caught up"}</p>
          )}
        </div>
      </div>

      {/* Recent activity — clean list, larger text */}
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
