/* The five division metals, as inline SVG.

   This file exists because of one report: "the league tiers are unclear and do not make
   sense to users". The board used to render all five divisions in the same gold, on purpose
   — the old rule was "division is carried by luminance, never hue, so five metals never
   fight one accent". That rule is what broke them: a SILVER rung painted gold is a
   contradiction the reader has to resolve before they can read the ladder at all.

   The rule now: hue is identity ONLY here, on the tier band and the top three's rank plates.
   Gold everywhere else on the board still means the mechanic (the promotion zone, the cut,
   your row), so the two never collide — a gold *crest* is the Gold division, gold *anything
   else* is "this is live".

   Still zero rasters: every crest is a path, so nothing can drift out of registration the way
   the deleted ped-*.webp overlays did. league_assert fails on any background-image: url(). */

export const METALS = ["bronze", "silver", "gold", "platinum", "diamond"] as const;
export type Metal = (typeof METALS)[number];

/** hi / mid / low stops, pitched for the LIGHT canvas (2026-08-03).
 *
 *  The previous set was tuned for a near-black stage, where a metal reads by its bright stop.
 *  On white that inverts: #FFFFFF and #F2FDFF highlights simply vanish, which is why silver,
 *  platinum and diamond collapsed into one another. Every hi stop is therefore pulled off
 *  white, and the MID — the stop that carries the identity — is saturated enough to hold its
 *  own against the canvas.
 *
 *  Five materials, five hues, checked as hues rather than luminances: warm brown → cool grey →
 *  deep gold → indigo-violet → cyan. Silver and platinum remain the pair most at risk of
 *  collapsing, so platinum is pushed hard into violet rather than merely "cooler". */
const STOPS: Record<Metal, readonly [string, string, string]> = {
  bronze: ["#F0C398", "#B4652C", "#5E3011"],
  silver: ["#E3EAF3", "#8C9BAD", "#465061"],
  gold: ["#FFDF8F", "#DFA326", "#7A5206"],
  platinum: ["#D3D8F7", "#7C86C9", "#3E4478"],
  diamond: ["#B4F0FB", "#2FB3D4", "#12586F"],
};

/** A shield crest. `dim` fades a division you haven't reached.
 *
 *  Gradient ids are namespaced by metal, and only one crest — the current division's, on the
 *  tier band — renders at a time. Two crests of the SAME metal would share one gradient
 *  definition: identical content, so that is harmless rather than a bug waiting to happen. */
export function Crest({ metal, size = 26, dim = false }: { metal: Metal; size?: number; dim?: boolean }) {
  const [hi, mid, lo] = STOPS[metal];
  const gid = `crest-${metal}`;
  return (
    <svg
      className="crest" width={size} height={size * (32 / 28)} viewBox="0 0 28 32"
      aria-hidden focusable="false" style={dim ? { opacity: 0.34 } : undefined}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.48" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </linearGradient>
      </defs>
      {/* Outlined in the DARK stop, not the light one. On the black stage a crest was defined
          by a rim-light; on the light canvas that same pale stroke dissolves into the page and
          the shield loses its silhouette. */}
      <path
        d="M14 1.4 26 5.4v10.9c0 7.6-5.4 12.6-12 14.3-6.6-1.7-12-6.7-12-14.3V5.4z"
        fill={`url(#${gid})`} stroke={lo} strokeOpacity=".5" strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* The bevel: one shaded facet down the right and one lit facet inside, which is what
          makes a flat path read as metal. */}
      <path d="M14 1.4 26 5.4v10.9c0 7.6-5.4 12.6-12 14.3z" fill="#000" fillOpacity=".15" />
      <path d="M14 5.6 22.2 8.3v8c0 5.3-3.6 8.8-8.2 10.1z" fill={hi} fillOpacity=".22" />
    </svg>
  );
}

/** The champion's crown, worn on the top row's portrait.
 *
 *  All that survives of the deleted podium's ornament, and deliberately so: a laurel, a
 *  sunburst, drifting embers and a struck medal per runner-up were four flourishes competing
 *  to say one thing. Rank 1 wears a crown; ranks 2 and 3 wear their metal on the rank plate.
 *  Nothing else on the board is decorative. */
export function Crown() {
  return (
    <svg className="lg-crown" viewBox="0 0 64 40" aria-hidden focusable="false">
      <defs>
        <linearGradient id="lg-crown-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE9A0" />
          <stop offset="0.55" stopColor="#E8B02F" />
          <stop offset="1" stopColor="#8A5E08" />
        </linearGradient>
      </defs>
      {/* Outlined dark, and the jewels sit ON the gold rather than against the page — a pale
          stroke that worked on the black stage is invisible on the light canvas. */}
      <path
        d="M6 34 L2 10 L18 20 L32 4 L46 20 L62 10 L58 34 Z"
        fill="url(#lg-crown-g)" stroke="#7A5206" strokeOpacity=".55" strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="4" r="3.2" fill="#FFF3CE" stroke="#7A5206" strokeOpacity=".5" strokeWidth="1" />
      <circle cx="2" cy="10" r="2.4" fill="#FFF3CE" stroke="#7A5206" strokeOpacity=".5" strokeWidth="1" />
      <circle cx="62" cy="10" r="2.4" fill="#FFF3CE" stroke="#7A5206" strokeOpacity=".5" strokeWidth="1" />
    </svg>
  );
}
