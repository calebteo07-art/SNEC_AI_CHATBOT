/* PHOTOPIC · fluid input bus
 * FluidCanvas lives in the root layout; the things that disturb the ink
 * (pointer, Lenis scroll velocity, future scroll-threshold bursts) live all
 * over the tree. They push splats here; the simulation drains the queue each
 * step. Module-level on purpose — one fluid, one queue.
 */

export interface Splat {
  /** Position in [0,1] canvas UV (y up). */
  x: number;
  y: number;
  /** Velocity impulse in UV units/s. */
  dx: number;
  dy: number;
}

const queue: Splat[] = [];
let lastInputAt = 0;

export function pushSplat(s: Splat) {
  if (queue.length < 64) queue.push(s);
  lastInputAt = performance.now();
}

export function drainSplats(): Splat[] {
  if (queue.length === 0) return EMPTY;
  return queue.splice(0, queue.length);
}

export function lastInputTime(): number {
  return lastInputAt;
}

const EMPTY: Splat[] = [];
