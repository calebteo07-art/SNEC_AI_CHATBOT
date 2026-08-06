"use client";
/* AURORA Home — the student's game HUD, in FOUR ZONES:

     .hm-top     the brand, the level chip and the Eyecon menu (unchanged)
     .hm-console the top ROW: the deck and the streak card ABREAST on a wide screen,
                 stacked on everything narrower. Layout only — it paints nothing.
     .hm-deck    the CONSOLE — the status rail, and the greeting host beside ONE right-hand
                 rail (quest board → chest → League strip). One dark struck plate carrying
                 every object that is live RIGHT NOW.
     .hm-streak  the streak card — its own card, beside the console.
     .hm-record  what you have BUILT — the Lumens vault.

   The coverflow of the three entry points sits between the console row and the record,
   outside both guards.

   ⚠ THE STREAK IS OFF THE PLATE (2026-08-06, "separate the streak card from the rest of the
   top card") AND BESIDE IT (same day, fourth pass, "streak card and top card in the same
   row"). It went ONTO the deck two passes earlier and it keeps everything that move bought
   it — its place in the reading order beside the console, the AA-corrected planes — but it
   is no longer one of the console's inserts. It is the page's own card, so it takes the page
   radius back, and the row gap is the whole separation.
   ⚠ `.hm-console` IS A WRAPPER, NOT A ZONE. Wrapping two cards in a row must not merge them
   back into one object: it has no fill, no radius and no material of its own, so the only
   thing it changes is where the streak sits.
   It needs no guard of its own and must not be given one: StreakTile renders null without a
   streak_detail, which is exactly what a failed /api/progress leaves behind — so the same
   read that puts the notice above also silences this card, with no second condition to
   drift out of sync.

   TWO READS, TWO UNKNOWNS, and neither one is ever painted as a zero: useProgress owns
   who you are (level, XP, streak) and useHome owns what is live today (quests, chest,
   boost, League). */
import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/screens/AuthContext";
import { useProgress } from "@/hooks/useProgress";
import { useHome } from "@/hooks/useHome";
import { rankForLevel } from "@/lib/rank";
import { DAILY_XP_GOAL, XP_PER_LEVEL } from "@/lib/legacy/gamification";
import { confetti } from "@/fx/confetti";
import { pickGreeting, type GreetingCtx, type Track } from "@/aurora/lib/greeting";
import { HomeIconSprite, Icon } from "@/aurora/components/home/HomeIcons";
import { Logo } from "@/aurora/Logo";
import { GreetingHero } from "@/aurora/components/home/GreetingHero";
import { StatusBar } from "@/aurora/components/home/StatusBar";
import { QuestBoard } from "@/aurora/components/home/QuestBoard";
import { ChestTile } from "@/aurora/components/home/ChestTile";
import { RankStrip } from "@/aurora/components/home/RankStrip";
import { StreakTile } from "@/aurora/components/home/StreakTile";
import { FeatureCarousel } from "@/aurora/components/home/FeatureCarousel";
import { LumenLadder } from "@/aurora/components/home/LumenLadder";
import { EyeconMenu } from "@/aurora/components/home/EyeconMenu";
import { PoolToggle } from "@/aurora/components/home/PoolToggleSwitch";
import { ApiErrorNotice } from "@/aurora/components/ApiErrorNotice";
import { firstNameOf } from "@/aurora/lib/displayName";

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

export function Dashboard() {
  const { user } = useAuth();
  const { data: progress, isError: progressFailed } = useProgress();
  /* A failed /api/progress used to paint Level 1 · 0 XP · no streak as fact — the one
     screen a student opens to see their work, lying about it. `!progress` keeps the
     REFETCH case honest the other way: real-if-stale numbers stay on screen (placeholderData
     holds them) rather than being replaced by an alarm. */
  const progressUnknown = progressFailed && !progress;

  const { data: home, isError: homeFailed } = useHome();
  /* The same idiom, for the deck's own read. `!home` keeps the REFETCH case honest the
     same way: real-if-stale quests and chest stay on screen (placeholderData holds them)
     rather than being replaced by an alarm.
     It is NOT a guard AROUND the deck. GET /api/home degrades per-section by design, so an
     unknown read hands every section null and each one renders its own "couldn't load" —
     the board keeps its plate, the chest keeps its tile, and The League stays one tap away
     rather than the whole deck vanishing over one failed fetch. */
  const homeUnknown = homeFailed && !home;
  const hud = homeUnknown ? null : home;

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

  const firstName = firstNameOf(user?.fullName);
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
  const coinsEarned = progress?.coins_earned ?? 0;

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
      <div className="hm-top">
        <div className="hm-brand">
          <span className="hm-logo"><Logo size={40} /></span>
          <span className="hm-wm">EyeBot</span>
        </div>
        <div className="hm-topr">
          {(user?.role === "trainer" || user?.role === "admin") && <PoolToggle />}
          {!progressUnknown && (
            <div className="hm-chip struck-pill">
              <span>Level <b>{level}</b> <small>· {rank}</small></span>
              <span className="hm-medal"><Icon name="medal" /></span>
            </div>
          )}
          <EyeconMenu />
        </div>
      </div>

      <div className="hm-console">
        {progressUnknown ? (
          <ApiErrorNotice cause="Couldn’t load your progress" className="aurora-api-error--page" />
        ) : (
          /* THE DECK — what is live right now, on one struck plate. The status bar is the
             only place the live CLOCKS appear, and the streak NUMERAL has exactly one owner
             (the card beside it), so two readouts can never disagree. */
          <div className="hm-deck struck-structural">
            <StatusBar
              level={level}
              rank={rank}
              xpInLevel={xpInLevel}
              xpToNext={xpToNext}
              doneToday={detail?.done_today}
              boost={hud?.boost ?? null}
            />
            <div className="hm-deck-mid">
              <GreetingHero greeting={greeting} />
              {/* ONE COLUMN, in the order a student works it: what to do → what it pays →
                  where it puts you ("chest, volt, quest all in 1 column", 2026-08-06). The
                  chest and the strip keep their own wrapper because the PHONE puts those two
                  abreast — a single 60px row instead of two, out of the same 844px fold the
                  status bar and three quest rows have already spent. */}
              <div className="hm-rail">
                <QuestBoard quests={hud?.quests ?? null} />
                <div className="hm-deck-foot">
                  <ChestTile chest={hud?.chest ?? null} />
                  <RankStrip league={hud?.league ?? null} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Off the plate, beside it. See the zone map above — and note it stays OUTSIDE the
            guard: StreakTile renders null without a streak_detail, which is exactly what a
            failed /api/progress leaves behind, so there is no second condition to drift. */}
        <StreakTile detail={detail} />
      </div>

      {/* Outside the guard on purpose: the carousel reads no progress, so a failed read
          must still leave the three features reachable. */}
      <FeatureCarousel />

      {!progressUnknown && (
        /* THE RECORD — what you have built. Slower than the deck, and below it. The streak
           left this zone for the top of the page; the vault is the object that looks better
           wider, and it now gets the whole width instead of the larger of two tracks. */
        <div className="hm-record">
          <LumenLadder current={coinsEarned} />
        </div>
      )}
    </div>
  );
}
