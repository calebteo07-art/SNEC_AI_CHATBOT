/* PHOTOPIC · shared animation clock
 * Same subscribe API as v1, now backed by gsap.ticker so Lenis, the fluid
 * simulation, and GSAP tweens all advance on one clock in one order.
 * gsap.ticker pauses with requestAnimationFrame when the tab is hidden.
 */
import { gsap } from "gsap";

export type TickerCallback = (time: number, deltaMs: number) => void;

const subscribers = new Set<TickerCallback>();
let attached = false;

function onTick(timeSeconds: number, deltaTime: number) {
  /* v1 subscribers expect rAF-style millisecond timestamps. */
  const ms = timeSeconds * 1000;
  const delta = Math.min(deltaTime, 64);
  for (const cb of subscribers) cb(ms, delta);
}

/** Subscribe to the shared frame loop. Returns an unsubscribe function. */
export function subscribeTicker(cb: TickerCallback): () => void {
  subscribers.add(cb);
  if (!attached) {
    gsap.ticker.add(onTick);
    attached = true;
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && attached) {
      gsap.ticker.remove(onTick);
      attached = false;
    }
  };
}
