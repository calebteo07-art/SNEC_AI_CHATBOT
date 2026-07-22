"use client";
/* DonutGauge — a dependency-free dark ring gauge (0..1 fraction). A faint track
   ring + a coloured progress arc + a centred %. Pure SVG from chartGeometry;
   decorative (aria-hidden), pair with a text readout. */
import { arcPath } from "./chartGeometry";

type Tone = "blue" | "purple" | "green" | "rose";

export function DonutGauge({ value, label, tone = "blue", size = 132 }: {
  value: number; label?: string; tone?: Tone; size?: number;
}) {
  const frac = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const cx = 60, cy = 60, r = 48;
  // Cap a full ring just short of 360° so the arc never degenerates to a point.
  const endDeg = frac >= 1 ? 359.999 : frac * 360;
  const pct = Math.round(frac * 100);
  const stroke = `var(--g-${tone})`;

  return (
    <div className="aurora-gauge" style={{ width: size, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="10" />
        {frac > 0 && <path d={arcPath(cx, cy, r, 0, endDeg)} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round" />}
        <text x="60" y="58" textAnchor="middle" className="aurora-gauge-num">{pct}%</text>
        {label && <text x="60" y="76" textAnchor="middle" className="aurora-gauge-cap">{label}</text>}
      </svg>
    </div>
  );
}
