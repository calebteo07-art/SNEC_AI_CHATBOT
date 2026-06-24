"use client";
/* AURORA Dashboard — the command centre. Editorial gradient hero greeting + a
   bold "Week Lens" streak band (the daily ritual, front and centre), a clear
   launchpad linking every feature (Tutor / Virtual Patients / Flashcards), a
   Next-Best-Action band, and three big distinct-colour stat cards. XP + streak
   read from one synced source (useProgress), so the ring and the readouts never
   drift. */
import Link from "next/link";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/screens/AuthContext";
import { ChangePasswordModal } from "@/screens/ChangePasswordModal";
import { useProgress } from "@/hooks/useProgress";
import { useDueCount } from "@/hooks/useFlashcards";
import { OA_TOPICS, OT_TOPICS, PSA_TOPICS, type Track } from "@/lib/legacy/curriculum";
import { GradientHero, type Readout } from "@/aurora/components/GradientHero";
import { GoalRing } from "@/aurora/components/GoalRing";
import { StreakBand } from "@/aurora/components/StreakBand";
import { rankForLevel } from "@/lib/rank";
import { DAILY_XP_GOAL } from "@/lib/legacy/gamification";
import { useCountUp } from "@/hooks/useCountUp";
import { confetti } from "@/fx/confetti";

const TRACK_TOPICS: Record<Track, typeof OA_TOPICS> = { OA: OA_TOPICS, OT: OT_TOPICS, PSA: PSA_TOPICS };
const TRACK_LABELS: Record<Track, string> = {
  OA: "Ophthalmic Assistant",
  OT: "Ophthalmic Technician",
  PSA: "Patient Service Associate",
};

/* Compact line glyphs for the feature launchpad — same family as the Atlas Rail. */
const ico = { width: 36, height: 36, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const FEATURES = [
  {
    tone: "tutor", href: "/chat", title: "Tutor", sub: "Ask anything — your AI ophthalmology coach", go: "Open tutor →",
    icon: (<svg {...ico}><path d="M5 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-4 3V6a1 1 0 0 1 1-1Z" /><circle cx="9" cy="10" r="0.7" fill="currentColor" /><circle cx="12.5" cy="10" r="0.7" fill="currentColor" /><circle cx="16" cy="10" r="0.7" fill="currentColor" /></svg>),
  },
  {
    tone: "cases", href: "/cases", title: "Virtual Patients", sub: "Run a guided OSCE station with a real case", go: "Start a case →",
    icon: (<svg {...ico}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /></svg>),
  },
  {
    tone: "flash", href: "/flashcards", title: "Flashcards", sub: "Active-recall drills that adapt to you", go: "Study now →",
    icon: (<svg {...ico}><rect x="3" y="6" width="14" height="10" rx="2" /><path d="M7 4h14v12" /></svg>),
  },
] as const;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Dashboard() {
  const { user, setMustChangePassword } = useAuth();
  const { data: progress } = useProgress();
  const { data: dueCount = 0 } = useDueCount();   // SM-2 cards due for review today (F1)

  /* Post-session debrief, inlined here now that the Summary page is gone: when a
     flashcard run finishes it lands on the Dashboard with a one-shot flag, which
     we turn into a celebratory toast + confetti, then clear so it fires once. */
  useEffect(() => {
    if (sessionStorage.getItem("eyebot_session_complete") !== "1") return;
    sessionStorage.removeItem("eyebot_session_complete");
    let earnedXp = 0, cardsReviewed = 0;
    try {
      const s = JSON.parse(sessionStorage.getItem("eyebot_session") || "{}");
      earnedXp = Number(s.earnedXp) || 0;
      cardsReviewed = Number(s.cardsReviewed) || 0;
    } catch { /* no session detail — show a generic toast */ }
    toast.success(
      earnedXp > 0 ? `Session complete · +${earnedXp} XP` : "Session complete",
      { description: cardsReviewed > 0 ? `${cardsReviewed} card${cardsReviewed === 1 ? "" : "s"} reviewed. Added to your running total.` : undefined },
    );
    const t = setTimeout(() => {
      confetti({ particleCount: 130, spread: 90, startVelocity: 45, origin: { y: 0.32 },
        colors: ["#3C90FF", "#34A853", "#AD72FF", "#FFCF03", "#F96BD6", "#00BDD2"] });
    }, 220);
    return () => clearTimeout(t);
  }, []);

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

  /* Animated count-ups for the headline stat values. */
  const recallCU = useCountUp<HTMLSpanElement>(recall);
  const masteryCU = useCountUp<HTMLSpanElement>(masteryPct, { format: (n) => `${Math.round(n)}%` });
  const dueCU = useCountUp<HTMLSpanElement>(dueCount);

  const level = progress?.level ?? 1;
  const rank = rankForLevel(level);
  const readouts: Readout[] = [
    {
      label: rank.title,
      value: `Lv ${level}`,
      hint: rank.nextTitle ? `${rank.levelsToNext} level${rank.levelsToNext === 1 ? "" : "s"} to ${rank.nextTitle}` : "Top rank reached — nice work!",
    },
    { label: "XP", value: `${progress?.xp ?? 0}`, hint: "Experience points — earn them from flashcards, virtual patients and the tutor. 500 XP per level." },
    { label: "Sessions", value: `${progress?.session_count ?? 0}`, hint: "Total study sessions you've completed." },
  ];

  const dailyGoal = progress?.daily_goal ?? DAILY_XP_GOAL;
  const xpToday = progress?.xp_today ?? 0;

  const nba = nextTopic
    ? { title: nextTopic.label, sub: `Continue your ${trackLabel} pathway`, cta: "Continue", href: `/flashcards?topic=${nextTopic.id}` }
    : { title: "All topics cleared", sub: "Sharpen weak areas or talk to a virtual patient", cta: "Open Virtual Patients", href: "/cases" };

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
            value={xpToday}
            goal={dailyGoal}
            caption={xpToday >= dailyGoal ? "Daily goal done! 🎉" : `${xpToday} / ${dailyGoal} XP today`}
          />
        }
      />

      {/* Daily streak — the Week Lens. Front and centre under the hero. */}
      <StreakBand detail={progress?.streak_detail} />

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

      {/* Feature launchpad — the dashboard now links to every feature */}
      <div className="aurora-launch aurora-stagger">
        {FEATURES.map((f) => (
          <Link key={f.href} href={f.href} className="aurora-launchcard" data-tone={f.tone}>
            <span className="aurora-launch-ico" aria-hidden>{f.icon}</span>
            <p className="aurora-launch-title">{f.title}</p>
            <p className="aurora-launch-sub">{f.sub}</p>
            <span className="aurora-launch-go">{f.go}</span>
          </Link>
        ))}
      </div>

      {/* Three big distinct-colour stat cards — grow to fill the page */}
      <div className="aurora-bigstats aurora-stagger">
        <div className="aurora-bigstat" data-tone="cyan" data-testid="stat-card">
          <p className="aurora-bigstat-label">Recall queue</p>
          <p className="aurora-bigstat-value"><span ref={recallCU.ref}>{recallCU.display}</span></p>
          <p className="aurora-bigstat-foot">{recall > 0 ? "weak topics to revisit" : "nothing flagged — nice work"}</p>
        </div>

        <div className="aurora-bigstat" data-tone="green" data-testid="stat-card">
          <p className="aurora-bigstat-label">{activeTrack} mastery</p>
          <p className="aurora-bigstat-value"><span ref={masteryCU.ref}>{masteryCU.display}</span></p>
          <p className="aurora-bigstat-foot">{completedIds.length} of {topics.length} topics cleared</p>
        </div>

        <div className="aurora-bigstat" data-tone="amber" data-testid="stat-card">
          <p className="aurora-bigstat-label">Due today</p>
          <p className="aurora-bigstat-value"><span ref={dueCU.ref}>{dueCU.display}</span></p>
          {dueCount > 0 ? (
            <Link href="/flashcards?mode=review" className="aurora-bigstat-cta">Review now →</Link>
          ) : (
            <p className="aurora-bigstat-foot">{weakTopics.length > 0 ? `brush up: ${weakTopics[0]}` : "all caught up"}</p>
          )}
        </div>
      </div>
    </div>
  );
}
