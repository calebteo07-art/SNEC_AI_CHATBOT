/* One ranked row (rank 4+): rank chip, tier-ringed Selena, meta, and an XP count-up
   with a bar drawn relative to the cohort leader. Highlights the viewer's own row. */
"use client";
import { Selena } from "@/aurora/avatar/Selena";
import { useCountUp } from "@/hooks/useCountUp";
import { tierForXp } from "@/aurora/leaderboard/tiers";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import type { CSSProperties } from "react";
import { Lumen } from "@/aurora/components/Lumen";

export function LeaderboardRow({ e, topXp }: { e: LeaderboardEntry; topXp: number }) {
  const tier = tierForXp(e.xp);
  const { ref, display } = useCountUp<HTMLSpanElement>(e.xp);
  const pct = topXp > 0 ? Math.max(4, Math.round((e.xp / topXp) * 100)) : 0;
  return (
    <li className="lb-row" data-testid="lb-row" data-you={e.is_you || undefined}>
      <span className="lb-rk">{e.rank}</span>
      <span className="lb-face" style={{ "--rc": tier.c2 } as CSSProperties}>
        <Selena portraitUrl={e.portrait_url} background={e.avatar_config?.background} size={52} />
      </span>
      <span className="lb-meta">
        <span className="lb-nm">{e.name}{e.is_you && <span className="lb-youtag">You</span>}</span>
        <span className="lb-sub2">
          {e.role && <span className="lb-rolechip">{e.role}</span>}
          {e.streak_days > 0 && <span className="lb-streak">🔥 {e.streak_days}d</span>}
          <span className="lb-lvl">Lv {e.level}</span>
        </span>
      </span>
      <span className="lb-val">
        <span className="lb-n" ref={ref}><Lumen size={14} decorative /> {display}<small> Lumens</small></span>
        <span className="lb-xpbar"><span style={{ width: `${pct}%` }} /></span>
      </span>
    </li>
  );
}
