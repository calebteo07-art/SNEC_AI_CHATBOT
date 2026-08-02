"use client";
/* Load / error / empty affordances for the console.

   A failed admin read must LOOK like a failure. Rendering it as 0 made a broken backend
   indistinguishable from an empty cohort — the worst failure mode a clinical dashboard
   has, and the reason useAdmin's getJSON throws instead of returning a zero fallback.
   Ported intact from PanelState.tsx onto the .cs surface. */
import type { ReactNode } from "react";

export function CsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} style={{ height: 12, borderRadius: 6, background: "rgba(19,22,40,.07)" }} />
      ))}
    </div>
  );
}

export function CsError({ onRetry, label = "Couldn’t load this panel." }: {
  onRetry: () => void; label?: string;
}) {
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <p className="cs-note" style={{ margin: 0, color: "var(--cs-coral)", fontWeight: 600 }}>{label}</p>
      <button type="button" className="cs-btn-ghost" onClick={onRetry}>Retry</button>
    </div>
  );
}

export function CsEmpty({ children }: { children: ReactNode }) {
  return <p className="cs-note" style={{ margin: 0 }}>{children}</p>;
}

/** A figure must never render 0 while loading or failed — a 0 there is indistinguishable
    from a real measurement of an empty cohort. `…` while loading, `—` on error. */
export function figure(q: { isLoading: boolean; isError: boolean }, v: string | number): string {
  if (q.isLoading) return "…";
  if (q.isError) return "—";
  return String(v);
}
