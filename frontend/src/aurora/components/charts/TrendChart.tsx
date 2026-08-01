"use client";
/* TrendChart — a dependency-free dark line/area chart. Pure SVG from
   chartGeometry, scaled to its container via viewBox. The svg is decorative
   (aria-hidden); pair with a text summary.

   Takes EITHER a lone `values` series or a labelled `series[]`. Multi-series plots every
   line against ONE shared max, because the whole point of stacking them is to compare
   slopes — per-series autoscaling would draw a 40% pass rate and a 40-point average at
   the same height. The area gradient is single-series only: three translucent fills
   over each other is mud, and it is the lines being read, not the volume under them. */
import { useId } from "react";
import { niceCeil, points, linePath, areaPath } from "./chartGeometry";

const W = 320, H = 120, PAD = 10;
type Tone = "blue" | "purple" | "green" | "rose";

/** `readout` is the series' headline figure, shown in the legend so the colour, the name
    and the number are one thing to read rather than three. */
export type Series = { values: (number | null)[]; tone: Tone; label: string; readout?: string };

export function TrendChart({ values, tone = "blue", series, max: maxProp }: {
  values?: (number | null)[];
  tone?: Tone;
  series?: Series[];
  /** Pin the axis ceiling. Percentage series pass 100 so the frame is the honest 0–100
      rather than niceCeil of whatever this window happened to reach. */
  max?: number;
}) {
  const gid = useId().replace(/:/g, "");
  // One shape internally: a lone `values` is just a single unlabelled series.
  const lines: Series[] = series ?? (values ? [{ values, tone, label: "" }] : []);

  // Nothing PLOTTABLE, not merely nothing at index 0 — an all-null series is a window
  // with no attempts, and a legend floating over blank axes reads as a broken panel.
  if (!lines.some((s) => s.values.some((v) => v !== null))) {
    return <p className="aurora-unavail">No activity data yet.</p>;
  }

  const observed = lines.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const max = maxProp ?? niceCeil(Math.max(0, ...observed));
  const fill = lines.length === 1;

  return (
    <>
      <svg className="aurora-trend" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <defs>
          {fill && (
            <linearGradient id={`tg-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(--g-${lines[0].tone})`} stopOpacity="0.34" />
              <stop offset="100%" stopColor={`var(--g-${lines[0].tone})`} stopOpacity="0" />
            </linearGradient>
          )}
        </defs>
        {lines.map((s, si) => {
          const pts = points(s.values, W, H, PAD, max);
          const stroke = `var(--g-${s.tone})`;
          return (
            <g key={si}>
              {fill && <path d={areaPath(pts, H - PAD)} fill={`url(#tg-${gid})`} stroke="none" />}
              <path d={linePath(pts)} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {/* Dots on a sparse series, as before — plus ALWAYS on a point isolated
                  between two gaps. A one-point subpath is a bare `M`, which draws zero
                  pixels, so a cohort that trains twice a week would render a 30-day
                  chart that is completely blank yet reports attempts. */}
              {pts.map((p, i) => p && (pts.length <= 14 || (!pts[i - 1] && !pts[i + 1])) && (
                <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill={stroke} />
              ))}
            </g>
          );
        })}
      </svg>
      {series && (
        <ul data-testid="trend-legend" style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", gap: 14, flexWrap: "wrap" }}>
          {series.map((s) => (
            <li key={s.label} className="aurora-unavail" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden style={{ width: 10, height: 2, borderRadius: 2, background: `var(--g-${s.tone})` }} />
              {s.label}
              {s.readout && <strong style={{ color: "var(--ink-1)" }}>{s.readout}</strong>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
