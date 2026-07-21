/* In-app leave guard — the choke point that makes the persistent Atlas Rail and the ⌘K
   command palette respect an active flashcards deck / virtual-patient station. Those nav
   surfaces are rendered by the AppShell ON TOP of every route (including the immersive
   session screens), so a student could click a rail link (or a palette result) and slip out
   of a round without ever touching the in-screen Leave/Quit buttons — dodging the forfeit
   confirm entirely. This is the loophole.

   While a session is active it arm()s a handler; the rail link and palette consult
   intercept(href) on click: if a handler is armed, intercept fires it (the screen opens its
   forfeit confirm targeting `href`) and returns true, and the caller cancels the raw
   navigation. Disarmed (no session / screen unmounted) ⇒ intercept returns false and nav
   proceeds untouched. The actual Lumen charge still funnels through forfeitGuard.spend(), so
   even if a stray unmount beacon also fires there is never a double charge.

   Dependency-free so it unit-tests in isolation (see frontend/tests/leave_guard_logic.mjs).
   A single shared instance (`leaveGuard`) is exported because there is exactly one nav
   surface set and at most one active session screen mounted at a time. */

export interface LeaveGuard {
  /** Register the current active screen's intent to intercept in-app navigation. The
   *  handler receives the attempted destination href; it should open the screen's leave
   *  confirm pointed at that href. Re-arming replaces any previous handler. */
  arm(handler: (href: string) => void): void;
  /** Clear interception — call when the session ends or the screen unmounts, so later
   *  navigation is free again and a stale handler can never block the app. */
  disarm(): void;
  /** If armed, fire the handler with `href` and return true (the caller must then cancel
   *  its own navigation). If disarmed, return false (navigate normally). */
  intercept(href: string): boolean;
  readonly armed: boolean;
}

export function createLeaveGuard(): LeaveGuard {
  let handler: ((href: string) => void) | null = null;
  return {
    arm(next) {
      handler = next;
    },
    disarm() {
      handler = null;
    },
    intercept(href) {
      if (!handler) return false;
      handler(href);
      return true;
    },
    get armed() {
      return handler !== null;
    },
  };
}

/** The app-wide instance shared by the nav surfaces (AtlasRail, CommandPalette) and the
 *  active session screen (Flashcards, CaseSession). */
export const leaveGuard = createLeaveGuard();
