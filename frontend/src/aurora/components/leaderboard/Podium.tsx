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

export function Podium({ places, promoteCount, promoteTo, clock, onPeek, youRef }: {
  places: LeaderboardEntry[];
  promoteCount: number;
  /** The division these three are climbing into, or null at the summit. */
  promoteTo: string | null;
  /** "5d 3h", or null before the client's first tick. Owned by Leaderboard.tsx — see the
   *  DECK note below for why it is here rather than in the band. */
  clock: string | null;
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
    /* THE DECK (2026-08-04, "the cards and elements are not spaced out nicely"). The stage
       used to be a 700px island centred inside an 1148px board, with ~224px of dead flank
       either side of it and nothing on the page agreeing where its edges were: a 1148 band,
       a ~470 centred filter, a 700 stage and a 1148 ladder — four widths on four centres.
       The blocks deliberately do NOT grow to close that gap; past ~700px of stage the
       champion becomes a 2:1 slab, which is the bar-chart shape this whole pass exists to
       prevent and which league_assert bounds one-sidedly. The PLATFORM widens instead, and
       its two flanks pay for themselves by housing the two facts that had nowhere better to
       be: what standing here MEANS, and how long is left to do it. */
    <section className="pod-deck" data-testid="podium" aria-label="The top three this week">
      {/* TWO LINES, NOT ONE (2026-08-04, "top 3 promote to gold is cut off"). This was a
          nowrap pill in a track that is only as wide as the deck minus the stage — 134px at
          1440 and 154px at 1366 against a 188px pill, so on EVERY window under 1500px it
          overflowed its own cell, hid ~22-32px of itself under the second plinth and poked
          ~13-23px out through the deck's left border. A centred nowrap pill in a `1fr` track
          cannot be fixed by moving it: it has to stop being one line.
          Both spans keep the text they always had — the gate reads textContent — and the
          space that separates them lives INSIDE the second span, so it renders between them
          on the phone's inline caption row and collapses at the head of its own line once
          each span becomes a flex item on the deck. A whitespace text node between them
          would have grown an anonymous third line box instead. */}
      {promoteCount > 0 && (
        <p className="pod-banner" data-testid="podium-promo">
          <span className="pod-banner-do">
            <span className="pod-banner-ico" aria-hidden>▲</span>Top {promoteCount} promote
          </span>
          {promoteTo && <span className="pod-banner-to"> to {promoteTo}</span>}
          {/* The half of the mechanic nothing outside the (?) sheet stated: this ladder only
              goes UP. A weekly cut with no stated floor reads as a relegation risk, which is
              the opposite of what it is — and on the deck it also gives the flank the third
              line that lets it stand next to a 700px stage instead of hovering beside it. */}
          <span className="pod-banner-sub">Nobody drops</span>
        </p>
      )}

      <div className="pod">
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
                {/* The rendered SIZE comes from CSS, not from this prop: leaderboard.css sets
                    the wrap to `--face` with !important, because <Eyecon> writes its
                    width/height inline and the podium needs the portrait to track a variable
                    that changes at every breakpoint — which a prop cannot. These numbers are
                    the intrinsic <img> hint and the SSR size only; changing them changes
                    nothing on screen. Ring geometry lives in .pod-face: calc(--face + 13px)
                    with border-box, so the metal is ~6.5px on every side rather than an
                    N-px portrait in an N-px circle leaving a ring 0px wide. */}
                <Eyecon
                  config={e.avatar_config}
                  background={e.avatar_config?.background}
                  size={place === 1 ? 72 : 58}
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
      </div>

      {/* The clock, moved off the band's readout — that row had gained a third item while
          this flank was empty. `lb-reset` travels with it so the gate follows the element
          rather than the location. */}
      {clock && (
        <span className="pod-clock" data-testid="lb-reset">
          <span className="pod-clock-l"><span className="tb-dot" aria-hidden />Closes in</span>
          <span className="pod-clock-v"> {clock}</span>
          {/* SGT, stated. The countdown is computed against Singapore's Monday boundary and
              not the viewer's, which is up to 15 hours of difference — a reader in another
              timezone has no way to know that from a bare "5d 1h". */}
          <span className="pod-clock-sub">Monday, SGT</span>
        </span>
      )}
    </section>
  );
}
