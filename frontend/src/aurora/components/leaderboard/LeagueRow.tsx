"use client";
/* One rung of the league, and the line that cuts across it.

   Changes from the row this replaces:
   · a MOVEMENT arrow, from the once-daily rank snapshot — the board finally has a time axis;
   · no tier ring. Lifetime XP used to tint every row teal/violet/rose, which competed with
     the one thing that now matters (are you above the line?). Division carries prestige now.
   · the row is a button. Tapping it opens the peek sheet, which is also why it is the one
     element here that must clear 44px on touch. */
import { forwardRef } from "react";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { Lumen } from "@/aurora/components/Lumen";
import { arrowFor } from "@/aurora/leaderboard/league";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

export const LeagueRow = forwardRef<HTMLLIElement, {
  e: LeaderboardEntry;
  promo: boolean;
  onPeek: (e: LeaderboardEntry) => void;
}>(function LeagueRow({ e, promo, onPeek }, ref) {
  const mv = arrowFor(e.rank_delta);
  return (
    <li className="lg-item" ref={ref} data-promo={promo || undefined}>
      <button
        type="button"
        className="lg-row"
        data-testid="lb-row"
        data-you={e.is_you || undefined}
        onClick={() => onPeek(e)}
        aria-label={`${e.name}, rank ${e.rank}, ${e.xp.toLocaleString()} Lumens this week. ${mv.label}.`}
      >
        <span className="lg-rk">{e.rank}</span>
        <span className="lg-mv" data-dir={mv.dir} title={mv.label}>
          <span aria-hidden>{mv.glyph}</span>
        </span>
        <span className="lg-face">
          <Eyecon config={e.avatar_config} background={e.avatar_config?.background} size={44} />
        </span>
        <span className="lg-meta">
          <span className="lg-nm">
            {e.name}
            {e.is_you && <span className="lg-you">You</span>}
          </span>
          <span className="lg-sub">
            {e.role && <span className="lg-role">{e.role}</span>}
            <span className="lg-lvl">Lv {e.level}</span>
            {e.streak_days > 0 && <span className="lg-streak">{e.streak_days}d streak</span>}
          </span>
        </span>
        <span className="lg-score">
          <Lumen size={14} decorative />
          {e.xp.toLocaleString()}
        </span>
      </button>
    </li>
  );
});

/** The mechanic, made visible. Everything above this line is promoted on Monday.
 *  `aria-hidden` is deliberately NOT set — a screen-reader user needs to know where the
 *  cut falls just as much as a sighted one, and the rows carry no other signal for it. */
export function PromotionLine({ count, to }: { count: number; to: string | null }) {
  return (
    <li className="lg-line" data-testid="promotion-line">
      <span className="lg-line-txt">
        {to ? `Promotion zone · top ${count} advance to ${to}` : `Promotion zone · top ${count}`}
      </span>
    </li>
  );
}
