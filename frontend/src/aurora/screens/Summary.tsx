"use client";
/* AURORA Summary — the post-session debrief, lightened. A gradient-clipped XP
   count-up (frozen under reduced motion) of the XP actually earned this session,
   meaningful flashcard stats, the topic, and the onward actions. The running
   total comes from the backend (single source of truth). */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatCard } from "@/aurora/components/StatCard";
import { useReducedMotion } from "@/aurora/motion";
import { useProgress } from "@/hooks/useProgress";
import { checkAndUnlockAchievements, XP_REWARDS } from "@/lib/legacy/gamification";
import { rankForLevel } from "@/lib/rank";

function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem("eyebot_session") || "{}");
    return {
      topic: s.topic || "Ophthalmology",
      cardsReviewed: Number(s.cardsReviewed ?? (Array.isArray(s.cards) ? s.cards.length : 0)) || 0,
      avgScore: Number(s.avgScore ?? 0) || 0,
      earnedXp: Number(s.earnedXp ?? XP_REWARDS.sessionComplete) || 0,
      cardXp: Number(s.cardXp ?? 0) || 0,
      bonusXp: Number(s.bonusXp ?? XP_REWARDS.sessionComplete) || 0,
    };
  } catch {
    return { topic: "Ophthalmology", cardsReviewed: 0, avgScore: 0, earnedXp: XP_REWARDS.sessionComplete, cardXp: 0, bonusXp: XP_REWARDS.sessionComplete };
  }
}

export function Summary() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { data: progress } = useProgress();
  const [session] = useState(loadSession);
  const earned = session.earnedXp;
  const totalXp = progress?.xp ?? 0;
  const rank = rankForLevel(progress?.level ?? 1);
  const [shown, setShown] = useState(0);

  useEffect(() => { checkAndUnlockAchievements(); }, []);

  useEffect(() => {
    if (reduce) { setShown(earned); return; }
    let raf = 0;
    const t0 = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setShown(Math.round(earned * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, earned]);

  return (
    <div className="aurora-summary">
      <section className="aurora-summary-card">
        <p className="aurora-eyebrow">Session complete</p>
        <h1 className="aurora-summary-xp"><span className="aurora-clip">+{shown}</span></h1>
        <p className="aurora-summary-xp-label">XP earned this session</p>
        <p className="aurora-summary-xp-note">
          {session.cardXp > 0
            ? `${session.cardXp} XP from ${session.cardsReviewed} card${session.cardsReviewed === 1 ? "" : "s"} + ${session.bonusXp} finish bonus. Added to your running total below.`
            : `Includes a +${session.bonusXp} bonus for finishing. Added to your running total below.`}
        </p>

        <div className="aurora-summary-stats">
          <StatCard tone="blue" label="Cards reviewed" value={session.cardsReviewed} />
          <StatCard tone="purple" label="Avg score" value={session.avgScore ? `${session.avgScore}/100` : "—"} />
          <StatCard tone="rose" label="Total XP" value={totalXp} />
        </div>

        <p className="aurora-summary-rank">{rank.title} · Level {progress?.level ?? 1}</p>
        <span className="aurora-summary-topic">{session.topic}</span>

        <div className="aurora-summary-actions">
          <button type="button" className="aurora-toggle" onClick={() => router.push("/flashcards")}>Study more</button>
          <button type="button" className="aurora-cta aurora-flow" onClick={() => router.push("/dashboard")}><span>Continue learning →</span></button>
        </div>
        <button type="button" className="aurora-summary-link" onClick={() => router.push("/progress")}>View full progress →</button>
      </section>
    </div>
  );
}
