/* Lumen — the single app-wide game coin: an eye ENGRAVED into a gold medallion.
   The eye is minted from the same metal — tonal-gold relief (a chiselled almond,
   a domed iris ring, iris striations, a deep pupil recess, a catch-light) — never
   a flat colored eye pasted on the disc. Inline SVG so it stays crisp at every
   size (renders as small as 14px). Pass `spark` on celebratory surfaces (the reveal
   payoff, the reward banner) for a slow sheen sweep + rim twinkle + an occasional
   blink; it's off by default so the many small inline coins stay calm and never
   distract. `spark` motion freezes under reduced motion (OS pref + the app
   `data-motion="reduce"` toggle). Pass `decorative` where a visible "Lumens" label
   already sits beside the coin, so screen readers don't say it twice. */
import { useId } from "react";

// 8 iris striations — texture that enriches large sizes and harmlessly blurs small.
const SPOKES = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return {
    x1: +(16 + 2.5 * Math.cos(a)).toFixed(2), y1: +(16 + 2.5 * Math.sin(a)).toFixed(2),
    x2: +(16 + 3.7 * Math.cos(a)).toFixed(2), y2: +(16 + 3.7 * Math.sin(a)).toFixed(2),
  };
});
// the engraved eye's two contours (almond socket + iris ring), reused for the fill
// and for the two offset relief passes that carve the channel.
const ALMOND = "M6.8 16 Q16 9.6 25.2 16 Q16 22.4 6.8 16 Z";

export function Lumen({ size = 18, className, decorative = false, spark = false }:
  { size?: number; className?: string; decorative?: boolean; spark?: boolean }) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9]/g, "");
  const id = (s: string) => `lm-${s}-${uid}`;
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": "Lumens" };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}
      data-spark={spark || undefined} {...a11y}>
      <defs>
        <radialGradient id={id("face")} cx="34%" cy="30%" r="82%">
          <stop offset="0%" stopColor="#fff3c0" /><stop offset="36%" stopColor="#ffd21e" />
          <stop offset="72%" stopColor="#e6a900" /><stop offset="100%" stopColor="#c8930a" />
        </radialGradient>
        <linearGradient id={id("rim")} x1="5" y1="5" x2="27" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff8d8" /><stop offset="34%" stopColor="#ffd21e" />
          <stop offset="64%" stopColor="#c8930a" /><stop offset="100%" stopColor="#6e4c05" />
        </linearGradient>
        <linearGradient id={id("dish")} x1="9" y1="9.5" x2="23" y2="22.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6e4c05" /><stop offset="52%" stopColor="#d99f0c" />
          <stop offset="100%" stopColor="#ffe27a" />
        </linearGradient>
        <radialGradient id={id("iris")} cx="40%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#ffe98a" /><stop offset="46%" stopColor="#e6a900" />
          <stop offset="100%" stopColor="#8a6207" />
        </radialGradient>
        <radialGradient id={id("pupil")} cx="58%" cy="62%" r="74%">
          <stop offset="0%" stopColor="#6b4700" /><stop offset="55%" stopColor="#4a3100" />
          <stop offset="100%" stopColor="#2a1c00" />
        </radialGradient>
      </defs>

      {/* coin body: bright beveled rim → face, sold as struck metal by a bright
          inner highlight ring riding over a dark field-edge groove */}
      <circle cx="16" cy="16" r="15.3" fill={`url(#${id("rim")})`} />
      <circle cx="16" cy="16" r="13.6" fill={`url(#${id("face")})`} />
      <circle cx="16" cy="16" r="13.6" fill="none" stroke="#5a3d00" strokeWidth="0.9" strokeOpacity=".8" />
      <circle cx="16" cy="16" r="13.0" fill="none" stroke="#fff8d8" strokeWidth="0.5" strokeOpacity=".55" />

      {/* the engraved eye — one metal, defined purely by relief */}
      <g className={spark ? `lm-eye-${uid}` : undefined}>
        <path d={ALMOND} fill={`url(#${id("dish")})`} />
        <circle cx="16" cy="16" r="4" fill={`url(#${id("iris")})`} />
        <g stroke="#8a6207" strokeOpacity=".45" strokeWidth="0.35">
          {SPOKES.map((s, i) => <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />)}
        </g>
        {/* chiselled channel: a shadow wall up-left + a bright wall down-right so the
            cut reads as carved metal even at 14px */}
        <g fill="none" strokeWidth="0.9" strokeLinecap="round">
          <g stroke="#5a3d00" transform="translate(-0.4 -0.45)">
            <path d={ALMOND} /><circle cx="16" cy="16" r="4" />
          </g>
          <g stroke="#fff3c0" strokeOpacity=".9" transform="translate(0.4 0.45)">
            <path d={ALMOND} /><circle cx="16" cy="16" r="4" />
          </g>
        </g>
        {/* deep pupil recess + a bevelled lip + a polished catch-light */}
        <circle cx="16" cy="16" r="1.9" fill={`url(#${id("pupil")})`} />
        <circle cx="16" cy="16" r="1.9" fill="none" stroke="#a5760a" strokeWidth="0.4" strokeOpacity=".7" />
        <circle cx="15.2" cy="15.2" r="0.85" fill="#fff8dd" fillOpacity=".9" />
      </g>

      {/* soft top-left specular on the metal */}
      <ellipse cx="10.6" cy="9" rx="6" ry="3.2" transform="rotate(-32 10.6 9)" fill="#fff" fillOpacity=".13" />

      {spark && (
        <>
          <g className={`lm-tw-${uid}`}>
            <path d="M23.5 6 l0.8 2.2 2.2 0.8 -2.2 0.8 -0.8 2.2 -0.8 -2.2 -2.2 -0.8 2.2 -0.8 Z" fill="#fff8dd" />
          </g>
          <clipPath id={id("clip")}><circle cx="16" cy="16" r="15.3" /></clipPath>
          <g clipPath={`url(#${id("clip")})`}>
            <g transform="rotate(18 16 16)">
              <rect className={`lm-sheen-${uid}`} x="-14" y="-6" width="8" height="44" fill="#fff" fillOpacity=".26" />
            </g>
          </g>
          <style>{`
            @keyframes lm-blink-${uid}{0%,86%,100%{transform:scaleY(1)}92%{transform:scaleY(.07)}}
            @keyframes lm-sheen-${uid}{0%,55%{transform:translateX(0)}100%{transform:translateX(46px)}}
            @keyframes lm-tw-${uid}{0%,68%,100%{opacity:0;transform:scale(.4)}80%{opacity:.95;transform:scale(1)}}
            .lm-eye-${uid}{transform-box:fill-box;transform-origin:center;animation:lm-blink-${uid} 5.2s ease-in-out infinite}
            .lm-sheen-${uid}{transform-box:view-box;animation:lm-sheen-${uid} 5.2s ease-in-out infinite}
            .lm-tw-${uid}{transform-box:fill-box;transform-origin:center;animation:lm-tw-${uid} 5.2s ease-in-out infinite}
            html[data-motion="reduce"] .lm-eye-${uid},html[data-motion="reduce"] .lm-sheen-${uid},html[data-motion="reduce"] .lm-tw-${uid}{animation:none}
            html[data-motion="reduce"] .lm-sheen-${uid},html[data-motion="reduce"] .lm-tw-${uid}{opacity:0}
            @media (prefers-reduced-motion:reduce){.lm-eye-${uid},.lm-sheen-${uid},.lm-tw-${uid}{animation:none}.lm-sheen-${uid},.lm-tw-${uid}{opacity:0}}
          `}</style>
        </>
      )}
    </svg>
  );
}
