/* The Beam — the top of the league stage.

   A black stage lit by ONE source: a shaft of gold falling from off-stage onto the champion,
   with a pool of light on the floor beneath them. Everything is CSS + inline SVG; the three
   baked metal cards this replaces (ped-gold/silver/bronze.webp) are deleted, which is what
   permanently kills the "three mismatched illustrations" problem — there is no art to drift.

   Two things carry the hierarchy the old podium lacked:
   · SCALE. The champion's portrait is 1.7x the runners-up and their plinth is 2x as tall.
     The board this replaces raised #1 by 12px, which is why it read flat.
   · LIGHT. Only the champion is lit. 2nd and 3rd stand at the edge of the beam.

   DOM order is 1 → 2 → 3 and the visual 2 · 1 · 3 comes from CSS `order`, so a screen reader
   announces the winner first. The old markup was literally ordered 2-1-3. */
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { Lumen } from "@/aurora/components/Lumen";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

/** Portrait sizes — the 1.7x ratio the spec asks for, as literal pixels. */
const FACE = { 1: 108, 2: 64, 3: 64 } as const;

/** A minted laurel crown, inline so it inherits the stage's gold and scales without a raster. */
function Crown() {
  return (
    <svg className="bm-crown" viewBox="0 0 64 40" aria-hidden focusable="false">
      <defs>
        <linearGradient id="bm-crown-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE9A8" />
          <stop offset="0.55" stopColor="#F5C542" />
          <stop offset="1" stopColor="#B07D12" />
        </linearGradient>
      </defs>
      <path
        d="M6 34 L2 10 L18 20 L32 4 L46 20 L62 10 L58 34 Z"
        fill="url(#bm-crown-g)" stroke="#FFF3CE" strokeWidth="1.2" strokeLinejoin="round"
      />
      <circle cx="32" cy="4" r="3.2" fill="#FFF3CE" />
      <circle cx="2" cy="10" r="2.4" fill="#FFF3CE" />
      <circle cx="62" cy="10" r="2.4" fill="#FFF3CE" />
    </svg>
  );
}

function Slot({ e, place }: { e?: LeaderboardEntry; place: 1 | 2 | 3 }) {
  if (!e) {
    // Every place always renders. A cohort of one still gets a stage, not a lone figure
    // floating in the dark with two holes beside it.
    return (
      <li className="bm-slot bm-open" data-place={place} data-testid="podium-slot">
        <div className="bm-figure">
          <span className="bm-face bm-face-open" aria-hidden />
          <span className="bm-name">Open</span>
        </div>
        <div className="bm-plinth"><span className="bm-numeral" aria-hidden>{place}</span></div>
      </li>
    );
  }
  return (
    <li className="bm-slot" data-place={place} data-you={e.is_you || undefined} data-testid="podium-slot">
      <div className="bm-figure">
        {place === 1 && <Crown />}
        <span className="bm-face">
          <Eyecon config={e.avatar_config} background={e.avatar_config?.background} size={FACE[place]} />
        </span>
        <span className="bm-name">{e.name}</span>
        <span className="bm-score">
          <Lumen size={place === 1 ? 16 : 13} decorative />
          {e.xp.toLocaleString()}
        </span>
      </div>
      <div className="bm-plinth"><span className="bm-numeral" aria-hidden>{place}</span></div>
    </li>
  );
}

export function Beam({ podium }: { podium: LeaderboardEntry[] }) {
  return (
    <section className="bm" data-testid="podium" aria-label="This week's top three">
      {/* The single light source. Purely decorative and pointer-transparent, so it can sit
          over the figures without eating a tap. */}
      <div className="bm-ray" aria-hidden />
      <div className="bm-pool" aria-hidden />
      <ol className="bm-slots">
        <Slot e={podium[0]} place={1} />
        <Slot e={podium[1]} place={2} />
        <Slot e={podium[2]} place={3} />
      </ol>
    </section>
  );
}
