// frontend/src/aurora/Logo.tsx
// The single EyeBot logo mark: a rounded eye outline with an iris ring + pupil.
// Painted with currentColor so "black vs white per scenario" is just the colour
// a caller sets — tone="ink" → --logo-ink (near-black light / near-white dark),
// tone="white" → #fff. At tiny sizes the concentric ring collapses to a solid
// iris disc so it stays legible (favicon/rail). This is the ONLY copy of the glyph.
type Props = { size?: number; tone?: "ink" | "white"; title?: string };

export function Logo({ size = 28, tone = "ink", title = "EyeBot" }: Props) {
  const c = tone === "white" ? "#FFFFFF" : "var(--logo-ink)";
  const small = size <= 20;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title}
         style={{ color: c }} data-testid="aurora-logo">
      <path d="M6 24 C6 24 13 13 24 13 C35 13 42 24 42 24 C42 24 35 35 24 35 C13 35 6 24 6 24 Z"
            fill="none" stroke="currentColor" strokeWidth={small ? 3.8 : 3.2}
            strokeLinejoin="round" strokeLinecap="round" />
      {small ? (
        <circle cx="24" cy="24" r="6" fill="currentColor" />
      ) : (
        <>
          <circle cx="24" cy="24" r="7.4" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="24" cy="24" r="2.6" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function Wordmark({ size = 22, tone = "ink" }: { size?: number; tone?: "ink" | "white" }) {
  return (
    <span className="aurora-wordmark" style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <Logo size={size + 6} tone={tone} />
      <span className="aurora-wordmark-text" style={{ fontWeight: 500, letterSpacing: "-0.01em", fontSize: size,
                     color: tone === "white" ? "#fff" : "var(--ink)" }}>EyeBot</span>
    </span>
  );
}
