"use client";
/* The sticky "you" bar — shown only while your own row is scrolled out of sight.

   A 30-person division is taller than a phone. Without this, a student scrolling to see who
   is at the top loses the one row the whole page exists to tell them about. Tapping it
   returns them to their row. */
import { arrowFor } from "@/aurora/leaderboard/league";
import { Lumen } from "@/aurora/components/Lumen";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

export function YouBar({ you, promo, onJump }: {
  you: LeaderboardEntry;
  promo: boolean;
  onJump: () => void;
}) {
  const mv = arrowFor(you.rank_delta);
  return (
    <button
      type="button"
      className="youbar"
      data-testid="youbar"
      data-promo={promo || undefined}
      onClick={onJump}
      aria-label={`Jump to your row, rank ${you.rank}`}
    >
      <span className="youbar-rk">#{you.rank}</span>
      <span className="youbar-mv" data-dir={mv.dir} aria-hidden>{mv.glyph}</span>
      <span className="youbar-nm">You</span>
      <span className="youbar-score">
        <Lumen size={13} decorative />
        {you.xp.toLocaleString()}
      </span>
    </button>
  );
}
