"use client";
/* ChargeRing — the suspense beat between locking an answer and the flip. A conic
   stroke fills over CHARGE_MS; press-and-hold anywhere on the ring overlay charges
   it ~3× faster (agency, and a release valve for impatient learners). Calls
   onComplete once at full. Reduced motion: a short timeout, no spinning ring. */
import { useEffect, useRef, useState } from "react";

export const CHARGE_MS = 1500;
const REDUCED_MS = 250;
const BOOST = 3;

export function ChargeRing({ onComplete }: { onComplete: () => void }) {
  const [pct, setPct] = useState(0);
  const boosting = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => { if (done.current) return; done.current = true; onComplete(); };

    if (reduced) { const t = setTimeout(finish, REDUCED_MS); return () => clearTimeout(t); }

    let raf = 0; let prev = performance.now(); let p = 0;
    const tick = (now: number) => {
      const dt = now - prev; prev = now;
      p += (dt / CHARGE_MS) * (boosting.current ? BOOST : 1);
      if (p >= 1) { setPct(1); finish(); return; }
      setPct(p); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  const R = 52; const C = 2 * Math.PI * R;
  const down = () => { boosting.current = true; };
  const up = () => { boosting.current = false; };

  return (
    <div className="flash-charge" data-testid="flash-charge"
      onPointerDown={down} onPointerUp={up} onPointerLeave={up} aria-hidden>
      <svg className="flash-charge-ring" viewBox="0 0 120 120">
        <circle className="flash-charge-track" cx="60" cy="60" r={R} />
        <circle className="flash-charge-fill" cx="60" cy="60" r={R}
          style={{ strokeDasharray: C, strokeDashoffset: C * (1 - pct) }} />
      </svg>
      <span className="flash-charge-spark" />
      <span className="flash-charge-hint">hold to charge</span>
    </div>
  );
}
