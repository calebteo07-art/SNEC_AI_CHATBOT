"use client";
/* TrendChart — a dependency-free dark line/area chart. Pure SVG from
   chartGeometry, scaled to its container via viewBox. Decorative (aria-hidden);
   pair with a text summary. */
import { useId } from "react";
import { niceCeil, points, linePath, areaPath } from "./chartGeometry";

const W = 320, H = 120, PAD = 10;
type Tone = "blue" | "purple" | "green" | "rose";

export function TrendChart({ values, tone = "blue" }: { values: number[]; tone?: Tone }) {
  const gid = useId().replace(/:/g, "");
  if (values.length === 0) return <p className="aurora-unavail">No activity data yet.</p>;

  const max = niceCeil(Math.max(0, ...values));
  const pts = points(values, W, H, PAD, max);
  const stroke = `var(--g-${tone})`;

  return (
    <svg className="aurora-trend" viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <linearGradient id={`tg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.34" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(pts, H - PAD)} fill={`url(#tg-${gid})`} stroke="none" />
      <path d={linePath(pts)} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.length <= 14 && pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.4" fill={stroke} />)}
    </svg>
  );
}
