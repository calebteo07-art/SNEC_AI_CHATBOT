"use client";
import { Logo, Wordmark } from "@/aurora/Logo";
export default function Scratch() {
  return <main style={{ padding: 40, display: "grid", gap: 24 }}>
    <Wordmark /><Logo size={64} /><Logo size={16} />
  </main>;
}
