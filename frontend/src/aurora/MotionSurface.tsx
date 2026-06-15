"use client";
import type { ReactNode, CSSProperties } from "react";

/** Wraps content with the animated Gemini gradient clipped to its rounded border.
 *  `variant` lets it render a hero panel (solid gradient) or a tint (low-alpha). */
export function MotionSurface(
  { children, variant = "panel", style, className = "", "data-testid": dataTestId }:
  { children?: ReactNode; variant?: "panel" | "tint-blue" | "tint-purple" | "tint-rose" | "tint-green";
    style?: CSSProperties; className?: string; "data-testid"?: string },
) {
  return (
    <div className={`aurora-flow ${className}`}
         data-variant={variant}
         data-testid={dataTestId}
         style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}
