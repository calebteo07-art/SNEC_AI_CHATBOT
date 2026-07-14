"use client";
/* BarSeries — a dependency-free dark horizontal bar list. Each row: a label, a
   track, and one or more stacked segments (fractions of `max`, default 1). One
   segment reads as a plain bar; several stack left-to-right. Reuses the shared
   .aurora-bar-* track styling (dark via the .aurora-analytics scope). */
type Tone = "blue" | "purple" | "green" | "rose";

export interface BarRow {
  label: string;
  segments: { value: number; tone: Tone; title?: string }[];
  readout?: string;
  weak?: boolean;
}

const TONE: Record<Tone, string> = {
  blue: "var(--g-blue)", purple: "var(--g-purple)", green: "var(--g-green)", rose: "var(--g-rose)",
};

export function BarSeries({ rows, max = 1 }: { rows: BarRow[]; max?: number }) {
  if (rows.length === 0) return <p className="aurora-unavail">No data yet.</p>;
  const span = Math.max(1e-6, max);
  return (
    <div className="aurora-bars">
      {rows.map((row, i) => (
        <div key={row.label + i} className="aurora-bar-row">
          <span className="aurora-bar-label">{row.label}</span>
          <span className="aurora-bar-track" style={{ display: "flex" }}>
            {row.segments.map((s, j) => (
              <span
                key={j}
                className="aurora-bar-seg"
                title={s.title}
                style={{
                  width: `${Math.max(0, Math.min(1, s.value / span)) * 100}%`,
                  background: row.weak && row.segments.length === 1
                    ? "linear-gradient(100deg, var(--g-rose), var(--g-purple))"
                    : TONE[s.tone],
                }}
              />
            ))}
          </span>
          {row.readout !== undefined && <span className="aurora-bar-pct">{row.readout}</span>}
        </div>
      ))}
    </div>
  );
}
