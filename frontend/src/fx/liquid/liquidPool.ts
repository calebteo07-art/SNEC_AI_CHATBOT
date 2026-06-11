/* DARK ADAPTATION · WebGL context budget
 * Browsers evict the oldest GL context well before their hard cap.
 * Three live liquid contexts is bulletproof; the newest visible image
 * steals the slot of the oldest (which falls back to its plain <img>).
 */

const MAX_LIVE = 3;

export interface LiquidSlot {
  evict: () => void;
}

const live: LiquidSlot[] = [];

export function acquireLiquidSlot(evict: () => void): LiquidSlot {
  while (live.length >= MAX_LIVE) {
    live.shift()?.evict();
  }
  const slot: LiquidSlot = { evict };
  live.push(slot);
  return slot;
}

export function releaseLiquidSlot(slot: LiquidSlot) {
  const i = live.indexOf(slot);
  if (i >= 0) live.splice(i, 1);
}

export function liveLiquidCount(): number {
  return live.length;
}
