"use client";
/* GoalRing — a circular progress dial for the daily XP goal. Renders the Gemini
   gradient arc on light surfaces, or a clean white arc when placed on the dark
   gradient hero (onDark). The arc eases to its value and freezes under reduced
   motion (see aurora.css). Centre shows the percentage; an optional caption below
   spells out the raw numbers so it explains itself. */

export function GoalRing({
  value,
  goal,
  size = 104,
  caption,
  onDark = false,
}: {
  value: number;
  goal: number;
  size?: number;
  caption?: string;
  onDark?: boolean;
}) {
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const done = goal > 0 && value >= goal;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const track = onDark ? "rgba(255,255,255,0.28)" : "var(--hairline)";
  const arc = onDark ? "rgba(255,255,255,0.95)" : "url(#aurora-ring-grad)";

  return (
    <div
      className={`aurora-ring${onDark ? " is-on-dark" : ""}`}
      role="img"
      aria-label={`Daily goal: ${value} of ${goal} XP${done ? " — complete" : ""}`}
    >
      <div className="aurora-ring-dial" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          {!onDark && (
            <defs>
              <linearGradient id="aurora-ring-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--g-blue)" }} />
                <stop offset="50%" style={{ stopColor: "var(--g-purple)" }} />
                <stop offset="100%" style={{ stopColor: "var(--g-rose)" }} />
              </linearGradient>
            </defs>
          )}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={arc}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="aurora-ring-arc"
          />
        </svg>
        <div className="aurora-ring-center">
          {done
            ? <span className="aurora-ring-done" aria-hidden>✓</span>
            : <span className="aurora-ring-value">{Math.round(pct * 100)}<small>%</small></span>}
        </div>
      </div>
      {caption && <span className="aurora-ring-caption">{caption}</span>}
    </div>
  );
}
