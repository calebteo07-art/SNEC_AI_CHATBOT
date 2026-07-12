/* Lumen — the single app-wide game coin: a gold disc with an engraved iris + pupil.
   Inline SVG so it stays crisp and tintable at every size. Used in the flashcards HUD,
   home, leaderboard, tutor, and reward banners. */

export function Lumen({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label="Lumens" fill="none">
      <defs>
        <radialGradient id="lm-face" cx="38%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#ffe98a" />
          <stop offset="55%" stopColor="#ffd21e" />
          <stop offset="100%" stopColor="#e6a900" />
        </radialGradient>
        <radialGradient id="lm-iris" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#7fd8ff" />
          <stop offset="70%" stopColor="#1f8fd0" />
          <stop offset="100%" stopColor="#0b5c8a" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#lm-face)" stroke="#b9820a" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="#b9820a" strokeOpacity="0.55" strokeWidth="1" />
      <ellipse cx="16" cy="16" rx="9.5" ry="6.4" fill="#fff8dd" />
      <circle cx="16" cy="16" r="5.4" fill="url(#lm-iris)" />
      <circle cx="16" cy="16" r="2.4" fill="#0a2233" />
      <circle cx="13.9" cy="13.9" r="1.1" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

export function LumenCount({ value, size = 16, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontVariantNumeric: "tabular-nums" }}>
      <Lumen size={size} /> {value.toLocaleString()}
    </span>
  );
}
