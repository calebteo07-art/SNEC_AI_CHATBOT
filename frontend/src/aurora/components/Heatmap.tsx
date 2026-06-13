"use client";
/* Heatmap — a calendar grid whose cell intensity rides the Gemini gradient by
   value (0..1). Static and decorative (aria-hidden); pair with a text summary. */
import type { CSSProperties } from "react";

export function Heatmap({ values, columns = 7 }: { values: number[]; columns?: number }) {
  return (
    <div className="aurora-heatmap" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="aurora-heatcell"
          style={{ "--v": Math.max(0, Math.min(1, v)) } as CSSProperties}
        />
      ))}
    </div>
  );
}
