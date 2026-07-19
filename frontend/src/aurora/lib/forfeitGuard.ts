/* The one choke point for the quit-forfeit penalty — shared by the flashcards deck and the
   virtual-patient station. A session's flat Lumen forfeit must be charged AT MOST ONCE, and
   ONLY while a session is active (first study card / station loaded → deck finished / handover
   graded). Every exit route — a Quit/Leave button, Switch deck, browser Back, ⌘K→away,
   refresh/tab-close — funnels its decision through spend(), so no combination of routes (or
   stray re-renders / double unload+unmount) can double-charge or charge a session that never
   started. Dependency-free so it unit-tests in isolation. */

// Display-only Lumen amount shown in the forfeit copy. The SERVER owns the real deduction
// (tools/api/shared.py :: FORFEIT_PENALTY); keep these two values in sync by hand.
export const FORFEIT_LUMENS = 60;

export interface RoundForfeit {
  /** Mark whether a session is in progress. A false→true transition re-arms the charge
   *  (a fresh forfeitable session); calling it while already active is a no-op, so
   *  re-renders during a session never reset the spent flag. */
  setActive(active: boolean): void;
  /** Returns true exactly once per active session — the caller should then charge. Returns
   *  false if no session is active or this session has already been charged. */
  spend(): boolean;
  readonly active: boolean;
}

export function createRoundForfeit(): RoundForfeit {
  let active = false;
  let spent = false;
  return {
    setActive(next: boolean) {
      if (next && !active) spent = false; // new session begins unpaid
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
