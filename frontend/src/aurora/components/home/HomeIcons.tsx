/* Bespoke SVG icon set for the warm home. One hidden <symbol> sprite is rendered
   once (HomeIconSprite) near the top of the dashboard; <Icon name="…"/> references
   a symbol via <use>. Eye-care-themed, consistent 1.7 rounded stroke. No emoji. */
import type { CSSProperties } from "react";

export function Icon({
  name,
  className = "ico",
  gem = false,
  style,
}: {
  name: string;
  className?: string;
  gem?: boolean;
  style?: CSSProperties;
}) {
  return (
    <svg className={className} aria-hidden style={gem ? { stroke: "url(#gem)", ...style } : style}>
      <use href={`#i-${name}`} />
    </svg>
  );
}

export function HomeIconSprite() {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        <linearGradient id="gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4285F4" />
          <stop offset="0.5" stopColor="#A25AF6" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>

        <symbol id="i-eye" viewBox="0 0 24 24">
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3.4" />
        </symbol>
        <symbol id="i-tutor" viewBox="0 0 24 24">
          <path d="M5 5.5h14a1.6 1.6 0 0 1 1.6 1.6V15a1.6 1.6 0 0 1-1.6 1.6H10l-4.5 3.4V7.1A1.6 1.6 0 0 1 7 5.5Z" />
          <circle cx="12" cy="11" r="2.5" />
        </symbol>
        <symbol id="i-vp" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="12" r="2.8" />
          <path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6" />
        </symbol>
        <symbol id="i-flash" viewBox="0 0 24 24">
          <path d="M9 4.5h9A1.5 1.5 0 0 1 19.5 6v9" />
          <rect x="3.5" y="7.5" width="13.5" height="12" rx="2.4" />
          <path d="M11 10.5 8.5 14H11l-.6 3 3.1-3.9H11Z" className="fill" />
        </symbol>
        <symbol id="i-flame" viewBox="0 0 24 24">
          <path d="M12.5 2.5c1 4.2 4.5 5.8 4.5 9.8a5 5 0 0 1-10 0c0-1.8.6-2.9 1.5-4 .8 1 1.6 1.5 2.4 2.3-.3-3 .3-5.7 1.6-8.1Z" />
          <path className="core" d="M12 20a2.8 2.8 0 0 0 2.8-2.8c0-1.6-1.1-2.5-2.8-4.3-1.7 1.8-2.8 2.7-2.8 4.3A2.8 2.8 0 0 0 12 20Z" fill="currentColor" stroke="none" />
        </symbol>
        <symbol id="i-medal" viewBox="0 0 24 24">
          <path d="M9 3.5 7 9M15 3.5 17 9" />
          <circle cx="12" cy="14.5" r="5.2" />
          <path d="m12 12 .9 1.9 2 .2-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9.1 14l2-.2Z" className="fill" />
        </symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24">
          <path d="M4.5 12h14M12.5 6l6 6-6 6" />
        </symbol>
        <symbol id="i-refresh" viewBox="0 0 24 24">
          <path d="M4 11.5a8 8 0 0 1 13.7-5.2L20 8.5M20 4v4.5h-4.5" />
          <path d="M20 12.5a8 8 0 0 1-13.7 5.2L4 15.5M4 20v-4.5h4.5" />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <path d="M5 12.5 9.5 17 19 7" />
        </symbol>
        <symbol id="i-sun" viewBox="0 0 24 24">
          <path d="M3 18.5h18M12 3.5v3M5 9l1.8 1.8M19 9l-1.8 1.8" />
          <path d="M7.5 18.5a4.5 4.5 0 0 1 9 0" />
        </symbol>
        <symbol id="i-lens" viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="6.3" />
          <path d="m15.4 15.4 4.1 4.1" />
          <path d="M10.5 7.5a3 3 0 0 0-3 3" opacity="0.55" />
        </symbol>
        <symbol id="i-eagle" viewBox="0 0 24 24">
          <path d="M2.5 14.5c3.6 0 5.4-5 9.5-5s5.9 5 9.5 5" />
          <path d="M12 9.5V13" />
          <circle cx="12" cy="15.5" r="1" className="fill" />
        </symbol>
        <symbol id="i-spark" viewBox="0 0 24 24">
          <path d="M12 3.2 13.7 9 19.5 10.7 13.7 12.4 12 18.2 10.3 12.4 4.5 10.7 10.3 9Z" />
          <path d="M18.5 4.5 19 6.5 21 7 19 7.5 18.5 9.5 18 7.5 16 7 18 6.5Z" className="fill" />
        </symbol>
        <symbol id="i-moon" viewBox="0 0 24 24">
          <path d="M17 14.5A6.5 6.5 0 0 1 9.5 7a5 5 0 1 0 7.5 7.5Z" className="fill" />
        </symbol>
      </defs>
    </svg>
  );
}
