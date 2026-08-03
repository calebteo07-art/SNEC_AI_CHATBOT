/* The five division metals, as inline SVG.

   This file exists because of one report: "the league tiers are unclear and do not make
   sense to users". The board used to render all five divisions in the same gold, on purpose
   — the old rule was "division is carried by luminance, never hue, so five metals never
   fight one accent". That rule is what broke them: a SILVER rung painted gold is a
   contradiction the reader has to resolve before they can read the ladder at all.

   The rule now: hue is identity ONLY here, on the ladder and the podium. Gold everywhere
   else on the board still means the mechanic (promotion, your row, the champion), so the two
   never collide — a gold *crest* is the Gold division, gold *anything else* is "this is live".

   Still zero rasters: every crest is a path, so nothing can drift out of registration the way
   the deleted ped-*.webp overlays did. league_assert fails on any background-image: url(). */

export const METALS = ["bronze", "silver", "gold", "platinum", "diamond"] as const;
export type Metal = (typeof METALS)[number];

/** hi / mid / low stops. Picked so the ladder reads as five DIFFERENT materials at 34px on a
 *  phone: warm brown → neutral grey → warm yellow → cool violet-white → cyan. Silver and
 *  platinum are the pair most at risk of collapsing, so platinum is pushed cool and violet. */
const STOPS: Record<Metal, readonly [string, string, string]> = {
  bronze: ["#F6C79B", "#C97B3F", "#6B3712"],
  silver: ["#FFFFFF", "#C4CFDD", "#68737F"],
  gold: ["#FFF0BE", "#F5C542", "#8A5E08"],
  platinum: ["#FFFFFF", "#D6DAF2", "#767BA6"],
  diamond: ["#F2FDFF", "#7EE8FA", "#1E6C8E"],
};

/** A shield crest. `flat` drops the bevel for the tiny in-row usage.
 *
 *  Gradient ids are namespaced by metal and each metal renders once per ladder, so the ids
 *  stay unique. Two crests of the SAME metal would share one gradient definition — identical
 *  content, so that is harmless rather than a bug waiting to happen. */
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
      <path
        d="M14 1.4 26 5.4v10.9c0 7.6-5.4 12.6-12 14.3-6.6-1.7-12-6.7-12-14.3V5.4z"
        fill={`url(#${gid})`} stroke={hi} strokeOpacity=".55" strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* The bevel: one lit facet down the left, which is what makes a flat path read as metal. */}
      <path d="M14 1.4 26 5.4v10.9c0 7.6-5.4 12.6-12 14.3z" fill="#000" fillOpacity=".17" />
      <path d="M14 5.6 22.2 8.3v8c0 5.3-3.6 8.8-8.2 10.1z" fill={hi} fillOpacity=".16" />
    </svg>
  );
}

/** A laurel wreath, open at the top so the crown sits in the gap.
 *
 *  Two branches of tangential leaves on a visible stem. The tangent is what makes it a
 *  laurel: the first attempt pointed every leaf radially OUTWARD at an even spacing, which
 *  renders a sunflower — petals round a face, not a wreath. Leaves therefore lie nearly along
 *  the arc (62 degrees off radial) and taper toward the tips.
 *
 *  Placed by angle rather than drawn as one path: twelve ellipses plus two arcs is less code
 *  than the equivalent path data, and the wreath stays adjustable by editing one array. */
const LEAF = [
  { a: 48, s: 1 }, { a: 70, s: 1.06 }, { a: 92, s: 1 },
  { a: 114, s: 0.9 }, { a: 136, s: 0.78 }, { a: 156, s: 0.62 },
];
const R = 48;
/** Endpoint of the stem arc at `deg` from the top, clockwise. */
const pt = (deg: number, sign: 1 | -1) => {
  const r = (deg * Math.PI) / 180;
  return `${(sign * R * Math.sin(r)).toFixed(1)} ${(-R * Math.cos(r)).toFixed(1)}`;
};

export function Laurel() {
  return (
    <svg className="bm-laurel" viewBox="0 0 120 120" aria-hidden focusable="false">
      <defs>
        <linearGradient id="bm-laurel-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF0BE" />
          <stop offset="0.6" stopColor="#F5C542" />
          <stop offset="1" stopColor="#96690C" />
        </linearGradient>
      </defs>
      <g transform="translate(60 60)">
        {/* The stems, so the leaves read as growing off a branch rather than floating. */}
        <path
          d={`M ${pt(44, 1)} A ${R} ${R} 0 0 1 ${pt(160, 1)}`}
          fill="none" stroke="url(#bm-laurel-g)" strokeWidth="1.8" strokeLinecap="round" opacity=".75"
        />
        <path
          d={`M ${pt(44, -1)} A ${R} ${R} 0 0 0 ${pt(160, -1)}`}
          fill="none" stroke="url(#bm-laurel-g)" strokeWidth="1.8" strokeLinecap="round" opacity=".75"
        />
        <g fill="url(#bm-laurel-g)">
          {LEAF.flatMap(({ a, s }) => [{ a, s, m: 1 as const }, { a: -a, s, m: -1 as const }]).map(
            ({ a, s, m }) => (
              <ellipse
                key={a} cx="0" cy="0" rx="5.4" ry="12.6"
                transform={`rotate(${a}) translate(0 ${-R}) rotate(${-62 * m}) scale(${s})`}
              />
            ),
          )}
        </g>
      </g>
    </svg>
  );
}

/** A padlock for a division you haven't reached. An inline path rather than the 🔒 emoji,
 *  which renders full-colour on some platforms and monochrome on others — a ladder of metals
 *  is exactly where that inconsistency shows. */
export function Lock() {
  return (
    <svg className="dv-lock" viewBox="0 0 12 14" aria-hidden focusable="false">
      <path d="M3.2 6V4.4a2.8 2.8 0 0 1 5.6 0V6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1.6" y="6" width="8.8" height="7" rx="1.6" fill="currentColor" />
    </svg>
  );
}

/** The champion's crown. Kept from the board this refines — it was the one piece of ornament
 *  that already worked; it just had nothing around it. */
export function Crown() {
  return (
    <svg className="bm-crown" viewBox="0 0 64 40" aria-hidden focusable="false">
      <defs>
        <linearGradient id="bm-crown-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF6DA" />
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

/** A struck medal for 2nd and 3rd, hung on the portrait's lower edge.
 *
 *  The runners-up previously carried no ornament at all — only a thinner rim — so the podium
 *  read as "one winner and two bystanders". A medal each is what makes it a podium. */
export function Medal({ place }: { place: 2 | 3 }) {
  const metal: Metal = place === 2 ? "silver" : "bronze";
  const [hi, mid, lo] = STOPS[metal];
  const gid = `bm-medal-${place}`;
  return (
    <svg className="bm-medal" viewBox="0 0 34 34" aria-hidden focusable="false">
      <defs>
        <linearGradient id={gid} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.5" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </linearGradient>
      </defs>
      <circle cx="17" cy="17" r="15" fill={`url(#${gid})`} stroke={hi} strokeOpacity=".7" strokeWidth="1.4" />
      <circle cx="17" cy="17" r="11" fill="none" stroke={lo} strokeOpacity=".45" strokeWidth="1" />
      <text
        x="17" y="17" textAnchor="middle" dominantBaseline="central"
        fontSize="15" fontWeight="700" fill={lo} fillOpacity=".92"
        fontFamily="var(--disp)"
      >
        {place}
      </text>
    </svg>
  );
}
