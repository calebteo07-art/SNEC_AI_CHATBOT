"use client";
/* AURORA Home — the warm-premium student dashboard. A bento of: the greeting hero
   (ever-changing teasing line + level-up XP bar + Iris mascot), the daily-streak
   tile, a 3D coverflow of the three entry points, a milestone ladder, and real-data
   stat tiles. All numbers read from one synced source (useProgress). */
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/screens/AuthContext";
import { ChangePasswordModal } from "@/screens/ChangePasswordModal";
import { useProgress } from "@/hooks/useProgress";
import { useAvatar, useSelfHealPortrait } from "@/hooks/useAvatar";
import { rankForLevel } from "@/lib/rank";
import { DAILY_XP_GOAL, XP_PER_LEVEL } from "@/lib/legacy/gamification";
import { confetti } from "@/fx/confetti";
import { pickGreeting, type GreetingCtx, type Track } from "@/aurora/lib/greeting";
import { HomeIconSprite, Icon } from "@/aurora/components/home/HomeIcons";
import { Logo } from "@/aurora/Logo";
import { GreetingHero } from "@/aurora/components/home/GreetingHero";
import { StreakTile } from "@/aurora/components/home/StreakTile";
import { FeatureCarousel } from "@/aurora/components/home/FeatureCarousel";
import { MilestoneLadder } from "@/aurora/components/home/MilestoneLadder";
import { WeekStats } from "@/aurora/components/home/WeekStats";

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

export function Dashboard() {
  const { user, setMustChangePassword } = useAuth();
  const { data: progress } = useProgress();
  const { data: avatar } = useAvatar();
  useSelfHealPortrait(avatar);

  /* Post-session debrief, inlined here (the Summary page is gone): a finished
     flashcard run lands on the Home with a one-shot flag → celebratory toast +
     confetti, then clears so it fires once. */
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
      earnedXp > 0 ? `Session complete · +${earnedXp} Lumens` : "Session complete",
      { description: cardsReviewed > 0 ? `${cardsReviewed} card${cardsReviewed === 1 ? "" : "s"} reviewed. Added to your running total.` : undefined },
    );
    const t = setTimeout(() => {
      confetti({ particleCount: 130, spread: 90, startVelocity: 45, origin: { y: 0.32 },
        colors: ["#3C90FF", "#34A853", "#AD72FF", "#FFCF03", "#F96BD6", "#00BDD2"] });
    }, 220);
    return () => clearTimeout(t);
  }, []);

  const firstName = (user?.fullName ?? "there").split(" ")[0];
  const track = ((user?.studentRole as Track) || "OA");
  const level = progress?.level ?? 1;
  const rank = rankForLevel(level).title;
  const xp = progress?.xp ?? 0;
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpToNext = XP_PER_LEVEL - xpInLevel;
  const dailyGoal = progress?.daily_goal ?? DAILY_XP_GOAL;
  const xpToday = progress?.xp_today ?? 0;
  const detail = progress?.streak_detail;
  const streak = detail?.current ?? 0;

  const todayIdx = detail?.week.findIndex((d) => d.state === "today") ?? -1;
  const missedYesterday = todayIdx > 0 && detail?.week[todayIdx - 1]?.state === "missed";

  const ctx: GreetingCtx = {
    firstName, track, hour: new Date().getHours(), streak,
    doneToday: detail?.done_today ?? false,
    missedYesterday: Boolean(missedYesterday),
    xpToNext, goalMet: xpToday >= dailyGoal, bestStreak: detail?.best ?? 0,
  };
  /* Greeting rotation seed: day-of-year, so the teasing line changes each visit but
     stays stable within a render. */
  const greeting = pickGreeting(ctx, dayOfYear());

  return (
    <div className="aurora-home" data-testid="home-root">
      <HomeIconSprite />
      {user?.mustChangePassword && (
        <ChangePasswordModal forced onSuccess={() => setMustChangePassword(false)} />
      )}

      <div className="hm-top">
        <div className="hm-brand">
          <span className="hm-logo"><Logo size={40} /></span>
          <span className="hm-wm">EyeBot</span>
        </div>
        <div className="hm-topr">
          <div className="hm-chip">
            <span>Level <b>{level}</b> <small>· {rank}</small></span>
            <span className="hm-medal"><Icon name="medal" /></span>
          </div>
          <div className="hm-avatar" aria-hidden>{firstName.slice(0, 1).toUpperCase()}</div>
        </div>
      </div>

      <div className="hm-hero">
        <GreetingHero
          greeting={greeting}
          level={level}
          rank={rank}
          xpInLevel={xpInLevel}
          xpToNext={xpToNext}
        />
        <StreakTile detail={detail} xpToday={xpToday} dailyGoal={dailyGoal} />
      </div>

      <FeatureCarousel />

      <div className="hm-lower">
        <MilestoneLadder detail={detail} />
        <WeekStats progress={progress} />
      </div>
    </div>
  );
}
