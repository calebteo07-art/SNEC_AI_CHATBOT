"use client";
/* GridLights — the F1 start sequence over the first card of a deck. Three lights arm
   red one-by-one, then flick green with a "GO!" as the grid launches into Q1. Full-
   motion only and pointer-events:none (so it never blocks the answer tap); renders
   nothing under reduced motion — the harness path never sees it. Self-unmounts. */
import { useEffect, useState } from "react";

export function GridLights() {
  const reduced = typeof document !== "undefined" &&
    (document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [lit, setLit] = useState(0);     // 0..3 red lamps armed
  const [go, setGo] = useState(false);
  const [gone, setGone] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    const timers = [
      window.setTimeout(() => setLit(1), 260),
      window.setTimeout(() => setLit(2), 660),
      window.setTimeout(() => setLit(3), 1060),
      window.setTimeout(() => setGo(true), 1500),
      window.setTimeout(() => setGone(true), 2150),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  if (gone) return null;
  return (
    <div className={`flash-grid-lights${go ? " is-go" : ""}`} aria-hidden>
      <div className="flash-gl-lamps">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`flash-gl-lamp${go ? " is-green" : i < lit ? " is-red" : ""}`} />
        ))}
      </div>
      <div className="flash-gl-word">{go ? "GO!" : lit >= 3 ? "SET" : ""}</div>
    </div>
  );
}
