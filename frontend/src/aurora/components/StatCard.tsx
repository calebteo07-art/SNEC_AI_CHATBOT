"use client";
/* StatCard — a calm tonal card (blue / purple / rose) on a low-alpha animated
   Gemini tint, with a mono label + value and an optional body (sparkline,
   progress bar, or a small list). Colour comes only from the gradient tokens. */
import type { ReactNode } from "react";
import { MotionSurface } from "@/aurora/MotionSurface";

export type StatTone = "blue" | "purple" | "rose" | "green";

export function StatCard({
  tone,
  label,
  value,
  children,
}: {
  tone: StatTone;
  label: string;
  value?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <MotionSurface variant={`tint-${tone}`} style={{ borderRadius: "var(--radius-lg)" }}>
      <div className="aurora-statcard" data-tone={tone} data-testid="stat-card">
        <p className="aurora-statcard-label">{label}</p>
        {value !== undefined && <p className="aurora-statcard-value">{value}</p>}
        {children && <div className="aurora-statcard-body">{children}</div>}
      </div>
    </MotionSurface>
  );
}
