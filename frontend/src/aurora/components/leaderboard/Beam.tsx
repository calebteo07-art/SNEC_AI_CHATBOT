/* The Beam — the top of the league stage.

   Rebuilt 2026-08-03 on one report: the podium was "too simple". It was, deliberately: the
   rule it was built to was "SCALE IS THE ARGUMENT", so the champion got a 1.7x portrait and a
   2x plinth and nothing else. Three rectangles and a numeral is a *diagram* of a podium.

   Those ratios are kept exactly — they are right, and league_assert measures them — but scale
   is no longer the only argument. Added, in order of how much each carries:
   · REAL BLOCKS. Each plinth has a lit top face (a clipped trapezoid, so you read it from
     slightly above) over a bevelled front face, and casts a contact shadow on the floor.
     The old plinth was a flat rectangle with rounded corners.
   · METALS. Gold / silver / bronze on the plinths, numerals and rims. The runners-up used to
     differ from the champion only by a thinner portrait ring, so the podium read as one
     winner and two bystanders. Second and third now wear struck medals.
   · A CROWNED LAUREL on the champion, a rotating sunburst behind them, a shine that crosses
     their plinth once on arrival, and embers drifting up through the bloom.

   Rebuilt again 2026-08-03 onto the light canvas, and the fix that mattered most is not in
   this file: the plinths used to sit 6-8px apart, which is a bar chart rather than a podium.
   `gap: 0` in leaderboard.css makes the three a single stepped block and .bm-figure carries
   its own padding instead — so the markup here is unchanged and the seams are measured.

   Still zero rasters — every ornament is a gradient or an inline path, so nothing can drift
   out of registration the way the deleted ped-*.webp overlays did.

   DOM order is 1 -> 2 -> 3 and the visual 2 · 1 · 3 comes from CSS `order`, so a screen reader
   announces the winner first. The old markup was literally ordered 2-1-3. */
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { Lumen } from "@/aurora/components/Lumen";
import { Crown, Laurel, Medal } from "./Metals";
import type { Metal } from "./Metals";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

/** Portrait sizes — the 1.7x ratio the lock asks for, as literal pixels. Asserted by
 *  league_assert against the live layout, so these two numbers are load-bearing. */
const FACE = { 1: 108, 2: 64, 3: 64 } as const;
const METAL: Record<1 | 2 | 3, Metal> = { 1: "gold", 2: "silver", 3: "bronze" };

/** Six embers rising through the beam. Hand-placed rather than random: `Math.random()` in
 *  render would give SSR and the client different values and mismatch on hydration. */
const EMBERS = [
  { x: 24, d: 0, s: 9.5 }, { x: 38, d: 2.4, s: 11.5 }, { x: 50, d: 4.9, s: 8.5 },
  { x: 61, d: 1.3, s: 12.5 }, { x: 73, d: 3.6, s: 10.5 }, { x: 46, d: 6.2, s: 13.5 },
];

function Slot({ e, place }: { e?: LeaderboardEntry; place: 1 | 2 | 3 }) {
  const metal = METAL[place];
  if (!e) {
    // Every place always renders. A cohort of one still gets a stage, not a lone figure
    // floating in the dark with two holes beside it.
    return (
      <li className="bm-slot bm-open" data-place={place} data-metal={metal} data-testid="podium-slot">
        <div className="bm-figure">
          <span className="bm-face bm-face-open" aria-hidden />
          <span className="bm-name">Open</span>
        </div>
        <div className="bm-plinth">
          <span className="bm-top" aria-hidden />
          <span className="bm-numeral" aria-hidden>{place}</span>
        </div>
      </li>
    );
  }
  return (
    <li
      className="bm-slot" data-place={place} data-metal={metal}
      data-you={e.is_you || undefined} data-testid="podium-slot"
    >
      <div className="bm-figure">
        {place === 1 && <Crown />}
        <span className="bm-face">
          {place === 1 && <Laurel />}
          <Eyecon config={e.avatar_config} background={e.avatar_config?.background} size={FACE[place]} />
          {place !== 1 && <Medal place={place} />}
        </span>
        <span className="bm-name">{e.name}</span>
        <span className="bm-score">
          <Lumen size={place === 1 ? 16 : 13} decorative />
          {e.xp.toLocaleString()}
        </span>
      </div>
      <div className="bm-plinth">
        {/* The lit top face. Absolutely positioned, so the plinth's measured height stays
            exactly 132/66 — the ratio league_assert reads off this element. */}
        <span className="bm-top" aria-hidden />
        <span className="bm-numeral" aria-hidden>{place}</span>
        {place === 1 && <span className="bm-shine" aria-hidden />}
      </div>
    </li>
  );
}

export function Beam({ podium }: { podium: LeaderboardEntry[] }) {
  return (
    <section className="bm" data-testid="podium" aria-label="This week's top three">
      {/* Stage lighting. All of it decorative and pointer-transparent, so it can sit over the
          figures without eating a tap. */}
      <div className="bm-ray" aria-hidden />
      <div className="bm-pool" aria-hidden />
      {/* One clipping layer for everything that MOVES. The burst rotates, and a rotated
          square reports a bounding box 1.41x its width — enough to escape a 390px viewport
          and fail the overflow sweep even though the mask made it invisible out there. */}
      <div className="bm-fx" aria-hidden>
        <div className="bm-burst" />
        {EMBERS.map((em, i) => (
          <span
            key={i} className="bm-ember"
            style={{ left: `${em.x}%`, animationDelay: `${em.d}s`, animationDuration: `${em.s}s` }}
          />
        ))}
      </div>
      <ol className="bm-slots">
        <Slot e={podium[0]} place={1} />
        <Slot e={podium[1]} place={2} />
        <Slot e={podium[2]} place={3} />
      </ol>
    </section>
  );
}
