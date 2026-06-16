"use client";
/* Slim session readout: a filling progress ring + compact stats. No up-next queue. */
export function SessionReadout({
  idx, total, graded, avgScore, sessionXp,
}: { idx: number; total: number; graded: number; avgScore: number | null; sessionXp: number }) {
  const pct = total ? Math.round(((idx + 1) / total) * 100) : 0;
  return (
    <div className="aperture-readout" role="group" aria-label="Session progress">
      <span className="aperture-progress-ring" style={{ ["--p" as string]: pct }} aria-hidden>
        <span>{idx + 1}/{total}</span>
      </span>
      <span className="aperture-stat"><b>{graded}</b><small>graded</small></span>
      <span className="aperture-stat"><b>{avgScore ?? "—"}</b><small>avg</small></span>
      <span className="aperture-stat"><b>+{sessionXp}</b><small>XP</small></span>
    </div>
  );
}
