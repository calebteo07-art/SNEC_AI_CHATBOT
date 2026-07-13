/* One ranked pill (rank 4+): rank, tier-ringed Selena, name + role/level, and a right
   cluster carrying BOTH a Lumens badge (count-up) and a streak flame — stacked so they
   always fit, even at 390px. Row is tinted + ringed by the student's XP tier; the
   viewer's own row glows. */
"use client";
import type { CSSProperties } from "react";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { useCountUp } from "@/hooks/useCountUp";
import { tierForXp } from "@/aurora/leaderboard/tiers";
import { Lumen } from "@/aurora/components/Lumen";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

export function LeaderboardRow({ e }: { e: LeaderboardEntry }) {
  const tier = tierForXp(e.xp);
  const { ref, display } = useCountUp<HTMLSpanElement>(e.xp);
  return (
    <li
      className="lb-row"
      data-testid="lb-row"
      data-you={e.is_you || undefined}
      data-tier={tier.id}
      style={{ "--rc": tier.c2, "--rc1": tier.c1 } as CSSProperties}
    >
      <span className="lb-rk">{e.rank}</span>
      <span className="lb-face">
        <Eyecon portraitUrl={e.portrait_url} config={e.avatar_config} background={e.avatar_config?.background} size={46} />
      </span>
      <span className="lb-meta">
        <span className="lb-nm">
          {e.name}
          {e.is_you && <span className="lb-youtag">You</span>}
        </span>
        <span className="lb-sub2">
          {e.role && <span className="lb-rolechip">{e.role}</span>}
          <span className="lb-lvl">Lv {e.level}</span>
        </span>
      </span>
      <span className="lb-badges">
        <span className="lb-lum" ref={ref}>
          <Lumen size={15} decorative /> {display}
        </span>
        <span className="lb-streak" data-cold={e.streak_days === 0 || undefined}>
          <span aria-hidden>🔥</span> {e.streak_days}d
        </span>
      </span>
    </li>
  );
}
