"use client";
/* Null-gap aware trend line, drawn white for the saturated hero block.

   Two rules, both learned the hard way:

   - A null bucket is a GAP, never a point on the floor (D13). The endpoint returns null
     rather than 0 precisely so the chart can break the line; plotting nulls as zero
     draws a cliff and reads as a cohort collapse. Grade columns are still NULL on
     pre-Tier-2 rows, so this is the normal case, not an edge one.
   - A 1-point subpath draws NOTHING. A lone reading renders as a dot instead of
     silently disappearing. */

export function Sparkline({ values, height = 82 }: { values: (number | null)[]; height?: number }) {
  const W = 240;
  const n = values.length;
  if (n === 0) return null;

  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;

  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => height - 8 - ((v - lo) / span) * (height - 22);

  // Split into contiguous runs so nulls become gaps, not zeros.
  const runs: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else {
      cur.push({ i, v });
    }
  });
  if (cur.length) runs.push(cur);

  const lastRun = runs[runs.length - 1];
  const last = lastRun ? lastRun[lastRun.length - 1] : undefined;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label="Cohort mastery trend"
    >
      <line x1="0" y1={height * 0.27} x2={W} y2={height * 0.27} stroke="rgba(255,255,255,.17)" />
      <line x1="0" y1={height * 0.63} x2={W} y2={height * 0.63} stroke="rgba(255,255,255,.17)" />
      {runs.map((run, r) =>
        run.length === 1 ? (
          // A single reading has no line to draw — mark it, don't drop it.
          <circle key={r} cx={x(run[0].i)} cy={y(run[0].v)} r="3" fill="#fff" />
        ) : (
          <polyline
            key={r}
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={run.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
          />
        ),
      )}
      {last && <circle cx={x(last.i)} cy={y(last.v)} r="4.2" fill="#fff" />}
    </svg>
  );
}
