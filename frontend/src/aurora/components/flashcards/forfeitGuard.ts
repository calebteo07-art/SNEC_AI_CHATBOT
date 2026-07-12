/* The one choke point for the flashcards quit penalty. A round's −20 Lumen forfeit
   must be charged AT MOST ONCE, and ONLY while a round is active (first study card
   rendered → deck finished). Every exit route — Switch deck, Quit, browser Back,
   ⌘K→away, refresh/tab-close — funnels its decision through spend(), so no combination
   of routes (or stray re-renders / double unload+unmount) can double-charge or charge a
   round that never started. Dependency-free so it unit-tests in isolation. */
export interface RoundForfeit {
  /** Mark whether a round is in progress. A false→true transition re-arms the charge
   *  (a fresh forfeitable round); calling it while already active is a no-op, so
   *  re-renders during a round never reset the spent flag. */
  setActive(active: boolean): void;
  /** Returns true exactly once per active round — the caller should then charge. Returns
   *  false if no round is active or this round has already been charged. */
  spend(): boolean;
  readonly active: boolean;
}

export function createRoundForfeit(): RoundForfeit {
  let active = false;
  let spent = false;
  return {
    setActive(next: boolean) {
      if (next && !active) spent = false; // new round begins unpaid
      active = next;
    },
    spend() {
      if (!active || spent) return false;
      spent = true;
      return true;
    },
    get active() {
      return active;
    },
  };
}
