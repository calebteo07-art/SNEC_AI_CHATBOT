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
import { arrowFor, DIVISION_NAMES, TOP_DIVISION } from "@/aurora/leaderboard/league";
import { TIERS } from "./Tiers";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

export const LeagueRow = forwardRef<HTMLLIElement, {
  e: LeaderboardEntry;
  promo: boolean;
  onPeek: (e: LeaderboardEntry) => void;
  /** The division leader's weekly Lumens — the scale the gauge below is drawn against.
   *  Passed in rather than derived here because a row cannot see the board. */
  topXp: number;
}>(function LeagueRow({ e, promo, onPeek, topXp }, ref) {
  const mv = arrowFor(e.rank_delta);
  // The gauge. Clamped both ways: a stale snapshot can put a row above the leader it was
  // scaled against, and a bar wider than its own track paints outside the board.
  const pct = topXp > 0 ? Math.max(0, Math.min(100, (e.xp / topXp) * 100)) : 0;
  /* WHICH RACE THIS ROW IS IN (2026-08-08). The board lists the whole cohort now, so a row
     without its league reads as one ladder — and the promotion gold, which marks only the
     viewer's OWN division, would look like it lands at arbitrary places. Clamped exactly as
     nextDivisionName clamps: a null or out-of-range column must render a chip, not crash a
     row that is otherwise fine. */
  const tierIdx = Math.max(0, Math.min(TOP_DIVISION - 1, Math.trunc(Number(e.division) || 1) - 1));
  const leagueName = DIVISION_NAMES[tierIdx];
  return (
    /* data-role carries the row's ROLE onto the rung so CSS can colour it. Role is identity,
       which is the same licence the band has to wear a metal — spent here on the object that
       repeats 27 times, because a vivid canvas behind a ladder of 27 graphite gauges is still
       a grey ladder. Fill only: never an outline and never a lip, so role can never
       out-shout the promotion gold. */
    <li className="lg-item" ref={ref} data-promo={promo || undefined} data-role={e.role || undefined}>
      <button
        type="button"
        className="lg-row"
        data-testid="lb-row"
        data-you={e.is_you || undefined}
        onClick={() => onPeek(e)}
        aria-label={`${e.name}, ${leagueName} league, rank ${e.rank}, ${e.xp.toLocaleString()} Lumens this week. ${mv.label}.`}
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
            {/* Ink over a wash of its own metal, never a solid fill: promotion gold is the one
                state on this row that means something mechanical, and twenty-seven saturated
                league pills would drown it. Same reasoning as data-role's fill-only rule. */}
            <span className="lg-league" data-tier={TIERS[tierIdx]}>{leagueName}</span>
            {e.role && <span className="lg-role">{e.role}</span>}
            <span className="lg-lvl">Lv {e.level}</span>
            {e.streak_days > 0 && <span className="lg-streak">{e.streak_days}d</span>}
          </span>
        </span>
        {/* THE GAUGE. It exists because of what the wide board actually looked like: at
            1440 the name ended at x≈520 and the score began at x≈1046, so 62% of every
            rung was blank — the largest field of dead white on the page was inside the
            board, not beside it. Filling it with more chrome would have been decoration;
            this is the one thing that legitimately WANTS horizontal room, which is what
            turns "the board is too narrow" into a reason to widen it rather than a
            reason to accept the margins.
            aria-hidden: the row's own aria-label already states the Lumens, and a second
            reading of the same number as a percentage is noise, not access. */}
        <span className="lg-bar" aria-hidden style={{ ["--fill" as string]: `${pct}%` }} />

        <span className="lg-score">
          <Lumen size={13} decorative />
          {e.xp.toLocaleString()}
        </span>
      </button>
    </li>
  );
});

/* ⚠ `PromotionZone` and `PromotionLine` WERE DELETED on 2026-08-08, when the board became the
   whole cohort. Both described a contiguous run of promoting rows — a gold region headed by a
   caption and ended by a struck bar — and on a mixed list your division's promoting members
   are scattered among four other divisions', so there is no run to head and no single row to
   cut after. Drawing either anyway would have marked the wrong students, which is the most
   consequential thing this board can get wrong.
   What replaced them: `data-promo` per row, fed from `leagueRanks` (league.ts), plus the
   count and the destination stated in the head. Restoring these means restoring a contiguous
   promoted set first — not just re-adding the components. */
