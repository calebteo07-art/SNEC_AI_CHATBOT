import React from "react";
import { Navigate, useLocation } from "@/lib/nav";
import { useAuth } from "./AuthContext";
import { useAvatar } from "@/hooks/useAvatar";
import { useTour } from "@/aurora/tour/TourProvider";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { onboardingStage, resolveCustomized, wantsAlwaysStudio } from "./onboarding";

/** DEV convenience: force the welcome Studio to reappear on every load for iteration. STRICTLY
 *  opt-in (see wantsAlwaysStudio) — it no longer auto-enables under `next dev`, so a genuinely
 *  new student sees the Studio exactly once (gated on server truth `customized`), the same in
 *  dev as in production. Opt in per-device with `localStorage.eyebot_always_studio = "1"`. */
function devAlwaysStudio(): boolean {
  if (typeof window === "undefined") return false;
  return wantsAlwaysStudio(localStorage.getItem("eyebot_always_studio"));
}

/** Resets on every hard reload (module scope), so in dev-always mode the welcome Studio
 *  shows once per load and Save can still navigate away without the guard bouncing you
 *  straight back into it. */
let studioShownThisLoad = false;

function Spinner() {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page)" }}>
      <span className="spinner spinner--teal" aria-label="Loading" />
    </div>
  );
}

/** Holds every authenticated route to the first-login order — password → tour → Eyecon
 *  Studio → daily check-in → app. The order itself lives in ./onboarding.ts; this component
 *  only renders or redirects to whichever stage that returns. Trainers/admins are learners
 *  too (D7): every authenticated role runs the same gates. */
export function CheckInGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isCheckInDone, loading, user, setMustChangePassword } = useAuth();
  const location = useLocation();
  // The avatar query is shared/deduped with the rest of the app.
  const { data: avatar, isPending: avatarPending } = useAvatar(isAuthenticated);
  const { active: tourActive, seen: tourSeen } = useTour();

  // Landing on /studio (however you got there) counts as "shown" this load, so leaving it
  // in dev-always mode doesn't immediately redirect you back.
  const devAlways = devAlwaysStudio();
  React.useEffect(() => {
    if (devAlways && location.pathname === "/studio") studioShownThisLoad = true;
  }, [devAlways, location.pathname]);

  if (loading) return <Spinner />;

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  /* DEV-only: jump straight to the welcome Studio once per hard load, ahead of the real
     sequence, so it stays easy to iterate on. */
  if (devAlways && !studioShownThisLoad && location.pathname !== "/studio") {
    return <Navigate to="/studio?welcome=1" replace />;
  }

  /* Decide on the QUERY's state, not the field's absence — `avatar?.customized` reads
     undefined both while pending and when the response carries no such field, and blocking on
     the latter strands every student on a spinner. An errored or field-less response fails
     OPEN to the returning path; a genuine first-run student retries next load. queryClient
     bounds the wait (networkMode offlineFirst, retry < 2). */
  const stage = onboardingStage({
    mustChangePassword: user?.mustChangePassword === true,
    customized: resolveCustomized(avatarPending, avatar?.customized),
    tourSeen,
    isCheckInDone,
  });

  if (stage === "loading") return <Spinner />;

  /* A real gate now: it sits above every other stage on EVERY route, so a student can't
     navigate out of it (it used to render only on /dashboard, i.e. dead last). */
  if (stage === "password") {
    return <>{children}<ChangePasswordModal forced onSuccess={() => setMustChangePassword(false)} /></>;
  }

  /* The tour drives its own cross-route walk — and it now marks itself seen the moment it
     starts (see TourProvider), so an interrupted first run can't re-loop it. Never redirect out
     from under an active tour; only when it ends does the stage machine hand the student on. */
  if (tourActive) return <>{children}</>;

  /* Tour not on screen (not yet started, or already finished) — steer a first-run student to
     the hub the tour starts from. Once it has ended, `tourSeen` moves the stage to the Studio. */
  if (stage === "tour") {
    return location.pathname === "/homepage"
      ? <>{children}</>
      : <Navigate to="/homepage" replace />;
  }

  /* Mandatory first-run Eyecon onboarding: a student who has never customized their Eyecon
     is routed into the welcome Studio and CANNOT leave until they Save — which flips
     `customized` server-side, the one and only exit. */
  if (stage === "studio") {
    return location.pathname === "/studio"
      ? <>{children}</>
      : <Navigate to="/studio?welcome=1" replace />;
  }

  if (stage === "checkin") {
    return location.pathname === "/checkin"
      ? <>{children}</>
      : <Navigate to="/checkin" replace />;
  }

  return <>{children}</>;
}
