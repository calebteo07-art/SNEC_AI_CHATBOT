"use client";
/* ChargeBeat — the suspense beat between locking an answer and the flip. It no longer
   draws anything: the FRONT-face power meter (McqCard) is the charge visual now, so this
   is just a transparent full-card tap-catcher + timer that flips after BEAT_MS (a short
   REDUCED_MS under reduced motion). A tap anywhere skips straight to the reveal. */
import { useEffect, useRef } from "react";

export const BEAT_MS = 1700;
const REDUCED_MS = 250;

export function ChargeBeat({ onComplete }: { onComplete: () => void }) {
  const done = useRef(false);
  // Hold the latest onComplete in a ref so the timer effect can run ONCE (`[]`):
  // a parent re-render mid-beat (e.g. a reason card's background grade resolving)
  // must not restart the beat from zero.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const finish = () => { if (done.current) return; done.current = true; onCompleteRef.current(); };

  useEffect(() => {
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(finish, reduced ? REDUCED_MS : BEAT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flash-beat" data-testid="flash-charge" onClick={finish} aria-hidden />
  );
}
