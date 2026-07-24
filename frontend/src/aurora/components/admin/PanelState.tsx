"use client";
/* Shared load/error affordances for the admin board. A failed admin fetch must LOOK
   like a failure: rendering it as 0 made a broken backend indistinguishable from an
   empty cohort, which is the worst possible failure mode for a clinical dashboard. */

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="aurora-skel" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="aurora-skel-bar" />
      ))}
    </div>
  );
}

export function PanelError({ onRetry, label = "Couldn’t load this panel." }: {
  onRetry: () => void; label?: string;
}) {
  return (
    <div className="aurora-panel-error" role="alert">
      <p className="aurora-note is-err" style={{ margin: 0 }}>{label}</p>
      <button type="button" className="aurora-btn-ghost" onClick={onRetry}>Retry</button>
    </div>
  );
}
