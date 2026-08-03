"use client";
/* The podium — three solid objects on a floor, restored 2026-08-04 by request.

   It was deleted on 2026-08-03 for a real reason: the version before it cost ~380px and pushed
   the ladder off the page, so at 390x844 a student saw ONE rank. Bringing it back without
   bringing that back is the whole engineering problem here, and it is solved by budget rather
   than by taste — league_assert counts RANKS VISIBLE (these three plus the rows under them)
   and fails under 8. The stage is allowed to exist; it is not allowed to eat the ladder.

   What makes this read as a game object rather than a diagram of one, in order of how much
   work each does:

     1. A DARK DEFINING OUTLINE. Every rejected pass drew 1px hairlines at ~10% ink, which is
        the dashboard tell. These blocks carry a 2.5px edge in a darkened version of their own
        metal — never grey, because a grey outline on a coloured fill reads as a border and a
        darker-same-hue outline reads as a shadowed edge.
     2. A HARD LIP. A zero-blur offset shadow under each block. This is the single most
        recognisable material in mobile games and it costs one box-shadow layer.
     3. A LIT TOP FACE. `.pod-top` is a clip-path trapezoid INSIDE the block's own box — not a
        rotated element and not a protruding one. Both of those were tried before: a rotated
        square reports a bounding box 1.41x its width and escapes the 360px overflow sweep even
        under overflow:hidden, and a protruding top face clipped the descender off a thousands
        comma so 9,800 rendered as "9.800" (a decimal point, in a country where "." is the
        decimal separator). Inside the box, neither failure is available.
     4. A CONTACT SHADOW. `.pod-floor` puts the blocks ON something. Objects that float are the
        thing that made three cream rectangles read as a bar chart.

   Structure, and why: DOM order is 1, 2, 3 so a screen reader announces the champion first;
   CSS `order` paints them 2-1-3. The old board's DOM was literally 2-1-3 and announced second
   place first for weeks, because it looked right.

   The figure is a button, like a row, so tapping any of the three opens the same peek sheet.
   A podium you cannot interact with is a picture of a leaderboard. */
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { Lumen } from "@/aurora/components/Lumen";
import { Crown, PLACE_METALS } from "./Metals";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

export function Podium({ places, promoteCount, onPeek, youRef }: {
  places: LeaderboardEntry[];
  promoteCount: number;
  onPeek: (e: LeaderboardEntry) => void;
  /* The board tracks ONE "where am I" element so the sticky you-bar can appear when your own
     standing scrolls away. A student on the stage still needs that — a 30-person division is
     several screens tall, and scrolling down to see who is chasing you takes your own result
     off the page whether you finished 2nd or 22nd. A ref callback rather than a RefObject,
     because the same slot is shared with LeagueRow's <li> and the two element types would
     not both fit one invariant RefObject. */
  youRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <section className="pod" data-testid="podium" aria-label="The top three this week">
      {/* The floor the blocks stand on. One element, behind all three, so the contact shadows
          share a ground plane instead of each block inventing its own. */}
      <span className="pod-floor" aria-hidden />

      {places.map((e, i) => {
        // Position on the stage, not the entry's own rank: on the unfiltered board those are
        // the same, and the board withholds the podium entirely when they would differ.
        const place = i + 1;
        return (
          <article
            key={`${e.rank}-${e.name}`}
            ref={e.is_you ? youRef : undefined}
            className="pod-slot"
            data-testid="podium-slot"
            data-place={place}
            data-metal={PLACE_METALS[place]}
            data-you={e.is_you || undefined}
            /* The stage sits INSIDE the promotion zone whenever the cut reaches it, and it has
               to say so. Three students standing above a gold region that starts at rank 4,
               wearing no promotion marking of their own, read as excluded from it. */
            data-promo={e.rank <= promoteCount || undefined}
          >
            <button
              type="button"
              className="pod-fig"
              onClick={() => onPeek(e)}
              aria-label={`${e.name}, ${place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"} place, ${e.xp.toLocaleString()} Lumens this week`}
            >
              {place === 1 && <Crown />}
              <span className="pod-face">
                {/* 56 / 44. The champion's portrait is 1.27x the runners-up rather than the
                    1.4x that reads best in isolation — 6px of the height budget, paid back by
                    five other differentiators (plinth height, column width, the crown, the
                    sheen, and gold vs silver vs bronze material). The CSS ring is sized
                    calc(--face + 13px) with border-box, because an N-px portrait inside an
                    N-px bordered circle leaves a ring that is 0px wide and fully occluded. */}
                <Eyecon
                  config={e.avatar_config}
                  background={e.avatar_config?.background}
                  size={place === 1 ? 56 : 44}
                />
              </span>
              <span className="pod-nm">{e.name}</span>
              <span className="pod-score">
                <Lumen size={13} decorative />
                {e.xp.toLocaleString()}
              </span>
            </button>

            <div className="pod-block">
              <span className="pod-top" aria-hidden />
              {/* The biggest numeral on the page. A podium whose place numbers are the same
                  size as a list rank is a list with extra steps. */}
              <span className="pod-num">{e.rank}</span>
            </div>
          </article>
        );
      })}
    </section>
  );
}
