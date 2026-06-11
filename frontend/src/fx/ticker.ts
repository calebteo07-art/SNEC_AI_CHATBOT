/* DARK ADAPTATION · shared animation clock
 * One rAF loop drives every continuous effect (Lenis, liquid scenes, cursor).
 * Pauses when the tab is hidden; stops entirely when nothing is subscribed.
 */

export type TickerCallback = (time: number, deltaMs: number) => void;

const subscribers = new Set<TickerCallback>();
let rafId: number | null = null;
let last = 0;

function loop(time: number) {
  const delta = last ? Math.min(time - last, 64) : 16.7;
  last = time;
  for (const cb of subscribers) cb(time, delta);
  rafId = subscribers.size ? requestAnimationFrame(loop) : null;
}

function start() {
  if (rafId === null && subscribers.size > 0 && !document.hidden) {
    last = 0;
    rafId = requestAnimationFrame(loop);
  }
}

function stop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

/** Subscribe to the shared frame loop. Returns an unsubscribe function. */
export function subscribeTicker(cb: TickerCallback): () => void {
  subscribers.add(cb);
  start();
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0) stop();
  };
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
}
