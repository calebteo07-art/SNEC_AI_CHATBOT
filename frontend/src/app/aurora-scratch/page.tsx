"use client";
import { Logo, Wordmark } from "@/aurora/Logo";
import { MotionSurface } from "@/aurora/MotionSurface";
import { useReducedMotion } from "@/aurora/motion";
export default function Scratch() {
  useReducedMotion();
  return <main style={{ padding: 40, display: "grid", gap: 24 }}>
    <Wordmark /><Logo size={64} /><Logo size={16} />
    <MotionSurface data-testid="aurora-surface" style={{ height: 120 }} />
  </main>;
}
