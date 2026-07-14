"use client";
/* First-run grand tour controller. Watches the onboarding gates and, once they've all
   cleared on the dashboard, runs the cross-route walkthrough exactly once (localStorage
   eyebot_tour_seen). Mounted globally inside AuthProvider so it survives route changes.
   Renders nothing but the overlay. */
import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { useAvatar } from "@/hooks/useAvatar";
import { TourOverlay } from "./TourOverlay";
import { activeSteps, shouldStartTour, TOUR_KEY, type TourStep } from "./tourSteps";

/* Module scope: guards against a double-start across re-renders within one page load. */
let startedThisLoad = false;

export function TourProvider() {
  const { isAuthenticated, isCheckInDone, user } = useAuth();
  const { data: avatar } = useAvatar(isAuthenticated);
  const pathname = usePathname();
  const router = useRouter();

  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);

  /* Start gate — fire once when all onboarding gates clear on the dashboard hub. */
  useEffect(() => {
    if (steps || startedThisLoad) return;
    const seen = typeof window !== "undefined" && localStorage.getItem(TOUR_KEY) === "true";
    if (shouldStartTour({ isAuthenticated, isCheckInDone, customized: avatar?.customized, seen, pathname })) {
      startedThisLoad = true;
      setSteps(activeSteps(user?.role));
      setIndex(0);
    }
  }, [steps, isAuthenticated, isCheckInDone, avatar?.customized, pathname, user?.role]);

  const end = useCallback(() => {
    try { localStorage.setItem(TOUR_KEY, "true"); } catch { /* storage disabled — session-only */ }
    setSteps(null);
    setIndex(0);
  }, []);

  const next = useCallback(() => {
    if (!steps) return;
    const ni = index + 1;
    if (ni >= steps.length) { end(); return; }
    const target = steps[ni];
    if (target.route !== pathname) router.push(target.route);
    setIndex(ni);
  }, [steps, index, pathname, router, end]);

  if (!steps) return null;
  return <TourOverlay steps={steps} index={index} onNext={next} onEnd={end} />;
}
