// frontend/src/aurora/Logo.tsx
type Props = { size?: number; tone?: "ink" | "white"; title?: string };

export function Logo({ size = 28, tone = "ink", title = "EyeBot" }: Props) {
  const c = tone === "white" ? "#FFFFFF" : "var(--logo-ink)";
  const small = size <= 32;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title}
         data-testid="aurora-logo">
      <path d="M4 24 Q24 7 44 24 Q24 41 4 24 Z" fill="none" stroke={c}
            strokeWidth={small ? 3.6 : 3} strokeLinejoin="round" />
      {small ? (
        <circle cx="24" cy="24" r="4.6" fill={c} />
      ) : (
        <path d="M24 18.8c.3 2.5 1.9 4.1 4.4 4.4-2.5.3-4.1 1.9-4.4 4.4-.3-2.5-1.9-4.1-4.4-4.4 2.5-.3 4.1-1.9 4.4-4.4z" fill={c} />
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
