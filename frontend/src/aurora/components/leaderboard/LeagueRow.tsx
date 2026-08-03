"use client";
/* One rung of the league, the zone that promotes, and the line that cuts it off.

   The board this replaces split the top three onto a podium and started the list at rank 4.
   Everyone is in one list now: a ranked ladder that begins at rank 1 is the whole genre, and
   the podium was costing ~380px to say something a medal on a row says for nothing. Places
   1-3 keep their recognition — a struck metal plate instead of a grey disc, and a crown on the
   champion — but they keep it IN the list.

   Kept from the previous row: the movement arrow off the once-daily rank snapshot (the board's
   only time axis), and no lifetime-XP tier ring (division carries prestige now, and a second
   colour system competed with the one thing that matters — are you above the line?).

   The row is a button; tapping it opens the peek sheet, which is why it is the one element
   here that must clear 44px on touch. */
import { forwardRef } from "react";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { Lumen } from "@/aurora/components/Lumen";
import { arrowFor } from "@/aurora/leaderboard/league";
import { Crown } from "./Metals";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

export const LeagueRow = forwardRef<HTMLLIElement, {
  e: LeaderboardEntry;
  promo: boolean;
  onPeek: (e: LeaderboardEntry) => void;
}>(function LeagueRow({ e, promo, onPeek }, ref) {
  const mv = arrowFor(e.rank_delta);
  // Only the real top three wear metal. On a role-filtered view the ranks are still the
  // division's own, so this stays honest without a second source of truth.
  const place = e.rank <= 3 ? e.rank : undefined;
  return (
    <li className="lg-item" ref={ref} data-promo={promo || undefined} data-place={place}>
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
          <Eyecon config={e.avatar_config} background={e.avatar_config?.background} size={36} />
          {e.rank === 1 && <Crown />}
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
