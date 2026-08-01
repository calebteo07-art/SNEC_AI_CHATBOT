/* Pure, dependency-free geometry helpers for the dark SVG dashboard charts. No
   React/DOM imports so the Node harness can type-strip + unit-test them. */

/** Round a max up to a readable axis ceiling (1 / 2 / 2.5 / 5 × 10ⁿ) so gridlines
    land on clean numbers. Returns at least `min` (default 1). */
export function niceCeil(value: number, min = 1): number {
  if (!Number.isFinite(value) || value <= 0) return min;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const frac = value / base;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return Math.max(min, nice * base);
}

/** A plotted point, or `null` for a slot the series has no value for. */
export type Pt = [number, number];

/** Map values to (x,y) points in a [pad..w-pad] × [pad..h-pad] box. x is evenly
    spaced (a single point centres); y is inverted for SVG. Empty ⇒ [].

    A `null` value is a HOLE, not a zero: it keeps its x slot — so parallel series stay
    on one x-grid — but plots nothing. /api/admin/performance-trend returns null for a
    bucket with no attempts precisely so the chart does not draw a cliff to the floor
    where a quiet day was. NaN is treated the same rather than emitting "MNaN NaN". */
export function points(values: (number | null)[], w: number, h: number, pad: number, max: number): (Pt | null)[] {
  const n = values.length;
  if (n === 0) return [];
  const span = Math.max(1e-6, max);
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const step = n === 1 ? 0 : innerW / (n - 1);
  return values.map((v, i) => {
    if (v === null || !Number.isFinite(v)) return null;
    const x = pad + (n === 1 ? innerW / 2 : step * i);
    const y = pad + innerH * (1 - Math.max(0, Math.min(1, v / span)));
    return [x, y] as Pt;
  });
}

/** Runs of consecutive plotted points; each gap ends a run. */
function runs(pts: (Pt | null)[]): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of pts) {
    if (p) cur.push(p);
    else if (cur.length) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

function runPath(run: Pt[]): string {
  return run.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

/** SVG `d` for the polyline through the points (straight segments), one subpath per
    run — a gap breaks the line instead of interpolating across missing days. */
export function linePath(pts: (Pt | null)[]): string {
  return runs(pts).map(runPath).join(" ");
}

/** Closed area `d`: each run dropped to `baselineY` and back to its own first x.
    Closing per run matters — one trailing Z would leave every earlier run open and the
    browser would fill it from the wrong corner. */
export function areaPath(pts: (Pt | null)[], baselineY: number): string {
  const b = baselineY.toFixed(1);
  return runs(pts).map((run) => {
    const first = run[0][0].toFixed(1);
    const last = run[run.length - 1][0].toFixed(1);
    return `${runPath(run)} L${last} ${b} L${first} ${b} Z`;
  }).join(" ");
}

/** Point on a circle of radius r about (cx,cy) at `deg` (0° = 12 o'clock, clockwise). */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** SVG arc `d` from `startDeg` to `endDeg` along a circle (a stroked ring, no fill). */
export function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [x0, y0] = polar(cx, cy, r, startDeg);
  const [x1, y1] = polar(cx, cy, r, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg > startDeg ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
