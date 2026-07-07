import React from "react";
import { Navigate, useLocation } from "@/lib/nav";
import { useAuth } from "./AuthContext";
import { useAvatar } from "@/hooks/useAvatar";

/** Set once a student has finished (or skipped) first-run Selena onboarding, so the gate
 *  never nags again on this device even before a save round-trips (ricoe §7). A save also
 *  flips `customized` server-side, which is the real source of truth. */
export const SELENA_ONBOARDED_KEY = "eyebot_selena_onboarded";

/** DEV: force the first-run Selena onboarding (the welcome Studio) to appear on EVERY page
 *  load — not just the genuine first login — so the customization screen is easy to iterate
 *  on. Automatically ON under `next dev`; on a production build (Render / the harness) it
 *  stays OFF (real students see the normal show-once flow) unless you opt in per-device with
 *  `localStorage.eyebot_always_studio = "1"`. Set it to "0" (or delete it) to turn back off. */
function devAlwaysStudio(): boolean {
  if (typeof window === "undefined") return false;
  const flag = localStorage.getItem("eyebot_always_studio");
  if (flag === "1") return true;
  if (flag === "0") return false;
  return process.env.NODE_ENV !== "production";
}

/** Resets on every hard reload (module scope), so in dev-always mode the welcome Studio
 *  shows once per load and Skip/Save can still navigate away without the guard bouncing you
 *  straight back into it. */
let studioShownThisLoad = false;

export function CheckInGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isCheckInDone, loading } = useAuth();
  const location = useLocation();
  const isStudent = user?.role === "student";
  // Only students fetch this; the query is shared/deduped with the rest of the app.
  const { data: avatar } = useAvatar(isAuthenticated && isStudent);

  // Landing on /studio (however you got there) counts as "shown" this load, so leaving it
  // in dev-always mode doesn't immediately redirect you back.
  const devAlways = devAlwaysStudio();
  React.useEffect(() => {
    if (devAlways && location.pathname === "/studio") studioShownThisLoad = true;
  }, [devAlways, location.pathname]);

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page)" }}>
        <span className="spinner spinner--teal" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  /* Admin users may only access the admin panel or their profile */
  if (user?.role === "admin" && location.pathname !== "/profile") {
    return <Navigate to="/admin" replace />;
  }

  /* Supervisor users may only access the supervisor panel or their profile */
  if (user?.role === "supervisor" && location.pathname !== "/supervisor" && location.pathname !== "/profile") {
    return <Navigate to="/supervisor" replace />;
  }

  /* Students must complete check-in before accessing any page */
  if (isStudent && !isCheckInDone && location.pathname !== "/checkin") {
    return <Navigate to="/checkin" replace />;
  }

  /* First-run Selena onboarding (ricoe §7): a student who has NEVER customized their
     Selena is routed once into the Studio (welcome mode) to build it. Only fires once
     the avatar has actually loaded as not-customized (undefined while loading ⇒ no
     redirect, no flash-loop), never on /studio itself, and never after a save/skip.
     In dev-always mode the gate ignores customized/onboarded and instead fires once per
     hard load (studioShownThisLoad) so the welcome Studio keeps reappearing for iteration. */
  const onboarded = typeof window !== "undefined" && localStorage.getItem(SELENA_ONBOARDED_KEY) === "1";
  const wantStudio = devAlways ? !studioShownThisLoad : avatar?.customized === false && !onboarded;
  if (isStudent && isCheckInDone && wantStudio && location.pathname !== "/studio") {
    return <Navigate to="/studio?welcome=1" replace />;
  }

  return <>{children}</>;
}
