"use client";
/* ProgressBar — a track with a Gemini-gradient fill. The fill animates within
   its rounded border via .aurora-flow and freezes under reduced motion. */
export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className="aurora-progress"
      role="progressbar"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="aurora-progress-fill aurora-flow" style={{ width: `${p}%` }} />
    </div>
  );
}
