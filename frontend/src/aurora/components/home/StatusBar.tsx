"use client";
/* StatusBar — the HUD's top rail: who you are (level + rank), how far the next level is,
   and the clocks that are running RIGHT NOW.

   Four rules, each one a defect this bar can actually ship:

   1. THE CLOCKS KEEP TICKING UNDER REDUCED MOTION. Only the glow AROUND the boost freezes
      (home.css, both signals). Reduced motion is about vestibular safety, not about
      withholding information, and a stopped clock lies to a student about how much boost
      they have left. The interval below is deliberately un-gated — if you are here to
      silence motion, gate the CSS animation, never this timer.
   2. …AND IT NEVER STARTS WHEN THERE IS NO CLOCK ON SCREEN. A 1s interval re-rendering a
      bar that shows no countdown is pure waste on every Home load without a boost.
   3. AN UNKNOWN IS NEVER AN ALARM. `doneToday` undefined means the progress read failed;
      streakRisk() answers `atRisk:false` for it, and the streak slot renders NOTHING. A
      failed read must not invent a deadline (Home has painted a failure as fact once).
   4. NO Date.now() DURING RENDER. This is App Router: the server's second and the client's
      differ, so a clock rendered during SSR hydrates against different text. `now` starts
      null on BOTH sides and fills in from an effect — the same shape as The League's week
      clock (Leaderboard.tsx), where a beat of no-clock is invisible.

   ⚠ NO <Lumen> COIN IN HERE, deliberately: its specular ellipse carries an SVG
   `transform="rotate(-32 …)"`, which getComputedStyle reports as a rotation matrix, and the
   deck's geometry bound fails anything inside `.hm-deck` that rotates its own box. The gold
   of the meter carries the Lumens identity instead. */
import { useEffect, useState } from "react";
import { boostRemaining, formatCountdown, streakRisk } from "@/aurora/lib/hud";
import type { BoostState } from "@/hooks/useHome";
import { useCountUp } from "@/hooks/useCountUp";
import { XP_PER_LEVEL } from "@/lib/legacy/gamification";
import { Icon } from "./HomeIcons";

export function StatusBar({
  level, rank, xpInLevel, xpToNext, doneToday, boost,
}: {
  level: number;
  rank: string;
  xpInLevel: number;
  xpToNext: number;
  /** undefined = the progress read FAILED — silence, never an alarm (rule 3). */
  doneToday: boolean | undefined;
  boost: BoostState | null;
}) {
  const [now, setNow] = useState<number | null>(null);

  const liveBoost = boost && boost.multiplier > 1 ? boost : null;
  /* streakRisk's VERDICT is time-independent — only `doneToday === false` is at risk — so
     the slot's presence is identical on the server and on the first client render. Only
     `msLeft` needs a real clock, and every read of it is gated on `now` below. */
  const risk = streakRisk(doneToday, now ?? 0);
  const ticking = Boolean(liveBoost) || risk.atRisk;

  useEffect(() => {
    if (!ticking) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ticking]);

  // Both freeze themselves under reduced motion — useCountUp checks both signals.
  const lvl = useCountUp<HTMLElement>(level);
  const xp = useCountUp<HTMLSpanElement>(xpInLevel);
  const pct = Math.max(0, Math.min(100, Math.round((xpInLevel / XP_PER_LEVEL) * 100)));

  return (
    <section
      className="hm-hud struck-structural" data-testid="hud-status"
      aria-label="Your level, Lumens and live timers"
    >
      {/* the level readout is the SAME struck object as the top bar's — one pill, one
          construction, one certified contrast pair, rather than a second one that drifts */}
      <div className="hm-chip struck-pill">
        <span>Level <b ref={lvl.ref}>{lvl.display}</b> <small>· {rank}</small></span>
        <span className="hm-medal"><Icon name="medal" /></span>
      </div>

      <div className="hm-hudxp">
        <p className="hm-hudxp-l">
          <span className="hm-hudxp-n disp" ref={xp.ref}>{xp.display}</span>
          <span className="hm-hudxp-d">/ {XP_PER_LEVEL} Lumens</span>
          <span className="hm-hudxp-g">{xpToNext} to Level {level + 1}</span>
        </p>
        <div
          className="hm-hudxp-bar" role="progressbar"
          aria-valuemin={0} aria-valuemax={XP_PER_LEVEL} aria-valuenow={xpInLevel}
          aria-label={`${xpInLevel} of ${XP_PER_LEVEL} Lumens into level ${level}`}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      {ticking && (
        <div className="hm-hudclocks">
          {/* A READOUT, not a control: no href, no onClick, no role — .struck-pill's press
              depth is scoped to :where(button, a, [role="button"]) precisely so this does
              not sink under a finger with nothing behind it. */}
          {liveBoost && (
            <span className="hm-boost struck-pill">
              <Icon name="spark" />
              <b>×{liveBoost.multiplier}</b>
              <small><span className="hm-sr">Lumens </span>boost</small>
              <span className="hm-boost-t" data-testid="boost-timer">
                {now === null ? "" : formatCountdown(boostRemaining(liveBoost.until, now))}
              </span>
              <span className="hm-sr"> left</span>
            </span>
          )}
          {risk.atRisk && (
            <span className="hm-risk struck-pill">
              <Icon name="flame" />
              <b>{now === null ? "" : formatCountdown(risk.msLeft)}</b>
              <small>left to keep your streak</small>
            </span>
          )}
        </div>
      )}
    </section>
  );
}
