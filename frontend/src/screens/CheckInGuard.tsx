import React from "react";
import { Navigate, useLocation } from "@/lib/nav";
import { useAuth } from "./AuthContext";
import { useAvatar } from "@/hooks/useAvatar";

/** DEV: force the first-run Eyecon onboarding (the welcome Studio) to appear on EVERY page
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
  const { isAuthenticated, isCheckInDone, loading } = useAuth();
  const location = useLocation();
  // Trainers/admins are learners too (D7): every authenticated role runs the same
  // check-in + Eyecon gates. The avatar query is shared/deduped with the rest of the app.
  const { data: avatar } = useAvatar(isAuthenticated);

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

  /* All authenticated users must complete the daily check-in before any page */
  if (!isCheckInDone && location.pathname !== "/checkin") {
    return <Navigate to="/checkin" replace />;
  }

  /* Mandatory first-run Eyecon onboarding: a student who has NEVER customized their Eyecon
     is routed into the welcome Studio and CANNOT leave until they Save. The gate keys off
     SERVER TRUTH only (avatar.customized) — no local skip flag — so the one and only exit is
     a Save (which flips customized server-side). Only fires once the avatar has loaded as
     not-customized (undefined while loading ⇒ no redirect, no flash-loop), never on /studio
     itself. In dev-always mode the gate ignores customized and fires once per hard load
     (studioShownThisLoad) so the welcome Studio keeps reappearing for iteration. */
  const wantStudio = devAlways ? !studioShownThisLoad : avatar?.customized === false;
  if (isCheckInDone && wantStudio && location.pathname !== "/studio") {
    return <Navigate to="/studio?welcome=1" replace />;
  }

  /* Re-customization is LOCKED: once customized, /studio is unreachable (the welcome flow is
     one-time only). Dev-always mode is exempt so the welcome Studio stays iterable. */
  if (!devAlways && avatar?.customized === true && location.pathname === "/studio") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
