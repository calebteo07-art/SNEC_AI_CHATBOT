/* RankStrip — the League standing, on the deck.

   It replaces the candy "See where you stand" tease that used to sit under the greeting
   card's XP bar. A tease asks a student to go and find out; a HUD tells them, and the
   number it tells them is the one the League is already ranking on.

   ⚠ IT KEEPS THE OLD PILL'S HOOKS — the same `.hm-lb` class and the same
   data-testid="greeting-leaderboard" — because the control's JOB is unchanged: it opens
   the leaderboard. Two green gates (home_mobile_assert.mjs, aurora_assert.mjs) reach for
   it by those names, and keeping them is cheaper and more honest than rewriting two
   passing gates for a control that still does exactly what it did.

   Three rules, each one a defect this strip can actually ship:

   1. A FAILED READ IS NEVER A FABRICATED RANK. GET /api/home degrades per-section and
      returns `league: null` on any error — the section is best-effort by design. Null
      renders the quiet tease and NOTHING numeric. Home has painted a failed read as fact
      once already.
   2. THE ROUTE STAYS REACHABLE EITHER WAY. This is a <Link> in every state, including the
      failed one: a student who cannot be told their rank must still be able to go and look
      it up. The failure is a quieter strip, never an absent one.
   3. promote_count === 0 IS THE TOP DIVISION, NOT A ZERO-SIZED PROMOTION ZONE. There is
      nothing above to be promoted into, so the framing changes rather than showing a gap to
      a place that does not exist. league.ts::computeChase draws the same distinction on the
      League itself ("hold the summit"), and this is the same student reading both screens.

   ⚠ NO <Lumen> COIN AND NOTHING THAT ROTATES (same as StatusBar / QuestBoard / ChestTile):
   an SVG carrying `transform="rotate(…)"` reports a rotation matrix to getComputedStyle,
   and the deck's geometry bound fails anything inside `.hm-deck` that rotates its own box.
   The medal and arrow glyphs in HomeIcons rotate nothing. */
import Link from "next/link";
import type { LeagueStanding } from "@/hooks/useHome";
import { Icon } from "./HomeIcons";

/** The line under the standing, and its tone.
 *
 *  GREEN MEANS UPWARD MOVEMENT on this deck, so only a real climb wears it: the summit is
 *  not movement, and neither is a rank that is already level with the cut. */
function chase(l: LeagueStanding): { text: string; tone: "up" | "flat" } | null {
  if (l.promote_count <= 0) return { text: "Top division — hold your rank", tone: "flat" };   // rule 3
  if (l.rank <= l.promote_count) return { text: "You’re in the promotion zone", tone: "up" };
  if (l.xp_to_promotion > 0) return { text: `${l.xp_to_promotion} Lumens to promotion`, tone: "up" };
  return null;
}

export function RankStrip({ league }: { league: LeagueStanding | null }) {
  const gap = league ? chase(league) : null;

  return (
    <Link
      href="/leaderboard"
      className="hm-lb struck-pill"
      data-testid="greeting-leaderboard"
      data-state={league ? "known" : "unknown"}
    >
      <Icon name="medal" className="ico hm-lb-medal" />
      <span className="hm-lb-copy">
        {league ? (
          <>
            {/* The separator is decoration; the screen reader gets the word instead, so the
                link announces "Volt, rank 7 of 24" rather than a middle dot. */}
            <b className="hm-lb-s">
              {league.division_name}
              <span className="hm-lb-dot" aria-hidden>·</span>
              <span className="hm-sr">, rank </span>#{league.rank} of {league.pool_size}
            </b>
            {gap && <small className="hm-lb-g" data-tone={gap.tone}>{gap.text}</small>}
          </>
        ) : (
          /* rules 1 + 2 — no rank, no pool, no gap: the tease is all a failed read has
             earned, and it is still a link. */
          <b className="hm-lb-s">See where you stand</b>
        )}
      </span>
      <Icon name="arrow" className="ico hm-lb-go" />
    </Link>
  );
}
