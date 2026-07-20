"use client";
/* First-run grand tour controller. Runs the cross-route walkthrough exactly once
   (localStorage eyebot_tour_seen) and publishes its state to CheckInGuard via TourContext:
   the guard suppresses its own redirects while `active` (the tour walks /chat, /cases,
   /flashcards, /leaderboard under its own steam), and re-renders off `seen` to hand the
   student on to the Studio the moment the tour ends. Wraps children inside AuthProvider so
   it survives route changes and never remounts. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { useAvatar } from "@/hooks/useAvatar";
import { TourOverlay } from "./TourOverlay";
import { activeSteps, shouldStartTour, TOUR_KEY, type TourStep } from "./tourSteps";

/* Module scope: guards against a double-start across re-renders within one page load. The tour
   marks itself seen the moment it starts (see markSeen), so a hard reload mid-tour does NOT
   restart it — the student is handed straight on to the Studio instead. */
let startedThisLoad = false;

function readSeen(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(TOUR_KEY) === "true"; } catch { return false; }
}

export interface TourState {
  /** The tour is on screen and driving navigation — the guard must not redirect. */
  active: boolean;
  /** The tour has run to completion on this device. */
  seen: boolean;
}

const TourContext = createContext<TourState>({ active: false, seen: false });

/** Read by CheckInGuard. The default is safe: a guard rendered outside the provider
    behaves as though the tour never ran. */
export function useTour(): TourState {
  return useContext(TourContext);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const { data: avatar } = useAvatar(isAuthenticated);
  const pathname = usePathname();
  const router = useRouter();

  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  /* Mirrored into React state because a bare localStorage read is not reactive: the guard
     needs to re-render the instant end() writes the flag. */
  const [seen, setSeen] = useState(readSeen);

  /* Persist the show-once flag (localStorage + reactive state). Written both when the tour
     STARTS and when it ends, so an interrupted first run (a reload mid-tour, a closed tab) can
     never re-loop it — the tour is strictly show-once per device. Flipping `seen` at start also
     lets the guard hand an interrupted student on to the Studio (the next onboarding rung). */
  const markSeen = useCallback(() => {
    try { localStorage.setItem(TOUR_KEY, "true"); } catch { /* storage disabled — session-only */ }
    setSeen(true);
  }, []);

  /* Start gate — fire once, on the dashboard hub, while the Eyecon is uncustomized. */
  useEffect(() => {
    if (steps || startedThisLoad) return;
    if (shouldStartTour({ isAuthenticated, customized: avatar?.customized, seen, pathname })) {
      startedThisLoad = true;
      markSeen();   // persist at START — an interrupted first run must not restart the tour
      setSteps(activeSteps(user?.role));
      setIndex(0);
    }
  }, [steps, seen, isAuthenticated, avatar?.customized, pathname, user?.role, markSeen]);

  const end = useCallback(() => {
    markSeen();
    setSteps(null);
    setIndex(0);
  }, [markSeen]);

  const next = useCallback(() => {
    if (!steps) return;
    const ni = index + 1;
    if (ni >= steps.length) { end(); return; }
    const target = steps[ni];
    if (target.route !== pathname) router.push(target.route);
    setIndex(ni);
  }, [steps, index, pathname, router, end]);

  return (
    <TourContext.Provider value={{ active: steps !== null, seen }}>
      {children}
      {steps && <TourOverlay steps={steps} index={index} onNext={next} onEnd={end} />}
    </TourContext.Provider>
  );
}
