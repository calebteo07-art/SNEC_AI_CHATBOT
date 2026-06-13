"use client";
/* AURORA Summary — the post-session debrief, lightened. A gradient-clipped XP
   count-up (frozen under reduced motion), three tonal stat cards, the topic, and
   the onward actions. Gamification totals via the legacy lib (no fx). */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatCard } from "@/aurora/components/StatCard";
import { useReducedMotion } from "@/aurora/motion";
import { getUserProgress, checkAndUnlockAchievements, XP_REWARDS } from "@/lib/legacy/gamification";

function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem("eyebot_session") || "{}");
    const cards = Array.isArray(s.cards) ? s.cards : [];
    return {
      topic: s.topic || "Ophthalmology",
      flashcardsGenerated: cards.length,
      questionsAnswered: Math.max(0, Math.floor((s.messageCount || 2) / 2)),
    };
  } catch {
    return { topic: "Ophthalmology", flashcardsGenerated: 0, questionsAnswered: 0 };
  }
}

export function Summary() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const session = loadSession();
  const earned = XP_REWARDS.sessionComplete;
  const [xp, setXp] = useState(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setXp(getUserProgress().xp);
    checkAndUnlockAchievements();
  }, []);

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
        <p className="aurora-summary-xp-label">XP earned</p>

        <div className="aurora-summary-stats">
          <StatCard tone="blue" label="Questions" value={session.questionsAnswered} />
          <StatCard tone="purple" label="Total XP" value={xp} />
          <StatCard tone="rose" label="Cards" value={session.flashcardsGenerated} />
        </div>

        <span className="aurora-summary-topic">{session.topic}</span>

        <div className="aurora-summary-actions">
          <button type="button" className="aurora-toggle" onClick={() => router.push("/flashcards")}>Review cards</button>
          <button type="button" className="aurora-cta aurora-flow" onClick={() => router.push("/dashboard")}><span>Continue learning →</span></button>
        </div>
        <button type="button" className="aurora-summary-link" onClick={() => router.push("/progress")}>View full progress →</button>
      </section>
    </div>
  );
}
