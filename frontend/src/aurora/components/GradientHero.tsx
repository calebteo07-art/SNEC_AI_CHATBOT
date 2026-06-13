"use client";
/* GradientHero — the saturated animated-gradient masthead. White display
   headline over the moving Gemini sweep, with optional mono readouts and a
   trailing action slot. */
import type { ReactNode } from "react";
import { MotionSurface } from "@/aurora/MotionSurface";

export type Readout = { label: string; value: string };

export function GradientHero({
  title,
  eyebrow,
  readouts,
  action,
}: {
  title: ReactNode;
  eyebrow?: string;
  readouts?: Readout[];
  action?: ReactNode;
}) {
  return (
    <MotionSurface variant="panel" style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="aurora-hero">
        <div className="aurora-hero-text">
          {eyebrow && <p className="aurora-hero-eyebrow">{eyebrow}</p>}
          <h1 className="aurora-hero-title">{title}</h1>
        </div>
        {readouts && readouts.length > 0 && (
          <div className="aurora-hero-readouts">
            {readouts.map((r) => (
              <div key={r.label} className="aurora-readout">
                <span className="aurora-readout-value">{r.value}</span>
                <span className="aurora-readout-label">{r.label}</span>
              </div>
            ))}
          </div>
        )}
        {action}
      </div>
    </MotionSurface>
  );
}
