"use client";
/* One rung of the league, the zone that promotes, and the line that cuts it off.

   A rung carries NO place ornament — no metal plate, no crown. Those went back onto the podium
   on 2026-08-04, and duplicating them here would mean the board says "first place" twice, in
   two different visual languages, about two different elements. On a role-filtered view the
   podium is withheld and rank 1 does appear as a row: still no crown, deliberately, because a
   filtered view is a lens and the champion of a lens is not a champion.

   Kept from the previous row: the movement arrow off the once-daily rank snapshot (the board's
   only time axis), and no lifetime-XP tier ring (division carries prestige now, and a second
   colour system competed with the one thing that matters — are you above the line?).

   The row is a button; tapping it opens the peek sheet, which is why it is the one element
   here that must clear 44px on touch. */
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
        {/* 34, inside a 44px struck ring. The portrait shrank by 2px when the ring arrived:
            an N-px portrait in an N-px bordered circle leaves a ring 0px wide, and the row's
            height is set by this element, so growing the ring instead would push every row
            past the 56px the visible-ranks budget is built on. */}
        <span className="lg-face">
          <Eyecon config={e.avatar_config} background={e.avatar_config?.background} size={34} />
        </span>
        <span className="lg-meta">
          <span className="lg-nm">
            {e.name}
            {e.is_you && <span className="lg-you">You</span>}
          </span>
          <span className="lg-sub">
            {e.role && <span className="lg-role">{e.role}</span>}
            <span className="lg-lvl">Lv {e.level}</span>
            {e.streak_days > 0 && <span className="lg-streak">{e.streak_days}d</span>}
          </span>
        </span>
        <span className="lg-score">
          <Lumen size={13} decorative />
          {e.xp.toLocaleString()}
        </span>
      </button>
    </li>
  );
});

/** The head of the promotion zone. States the mechanic once, in the one place it applies —
 *  which is why nothing above the board needs a sentence about it any more. */
export function PromotionZone({ count, to }: { count: number; to: string | null }) {
  return (
    <li className="lg-zone" data-testid="promotion-zone">
      <span className="lg-zone-ico" aria-hidden>▲</span>
      {to ? `Promotion zone · top ${count} advance to ${to}` : `Promotion zone · top ${count}`}
    </li>
  );
}

/** The cut itself — a struck bar, no caption. The zone above it is already labelled, and a
 *  second sentence here would make the most consequential pixel on the board a caption rather
 *  than a line. `aria-hidden` is deliberately NOT set: a screen-reader user needs to know
 *  where the cut falls just as much as a sighted one. */
export function PromotionLine() {
  return (
    <li className="lg-cut" data-testid="promotion-line">
      <span className="lg-sr">End of the promotion zone</span>
    </li>
  );
}
