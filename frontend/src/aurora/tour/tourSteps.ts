/* First-run grand tour — pure model. No React, no DOM: unit-tested directly
   (frontend/tests/tour_engine_test.mjs) and imported by the provider + overlay.
   All tour copy and anchors live here so they're editable in one place. */

export const TOUR_KEY = "eyebot_tour_seen";

export interface TourStep {
  id: string;
  /** pathname the user must be on for this step; the provider navigates here. */
  route: string;
  /** primary CSS selector to spotlight, or null for a centered card (no spotlight). */
  target: string | null;
  /** secondary selector tried if `target` never appears. */
  fallback?: string;
  title: string;
  body: string;
  /** anchor-wait timeout in ms (default 4000). */
  waitMs?: number;
  /** fire the celebratory confetti on this step (the finale). */
  confetti?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  { id: "welcome", route: "/dashboard", target: null,
    title: "Welcome to EyeBot! \u{1F441}️",
    body: "I'm your Eyecon — give me 60 seconds and I'll show you around." },
  { id: "modes", route: "/dashboard", target: '[data-testid="feature-carousel"]',
    title: "Your 3 ways to train \u{1F4AA}",
    body: "Tutor, Virtual Patients & Flashcards all live here — tap any card to dive straight in." },
  { id: "streak", route: "/dashboard", target: '[data-testid="streak-tile"]',
    title: "Keep the flame alive \u{1F525}",
    body: "Show up daily to grow your streak and hit your Lumens goal. Miss a day and it cools." },
  { id: "badges", route: "/dashboard", target: '[data-testid="milestone-ladder"]',
    title: "Collect every badge",
    body: "Each streak milestone drops a shiny Eyecon badge — watch the locked ones light up as you climb." },
  { id: "account", route: "/dashboard", target: ".hm-eyeconmenu-btn",
    title: "That's you, up top",
    body: "Your Eyecon lives here — account, password, and logout whenever you need them." },
  { id: "tutor", route: "/chat", target: ".aurora-composer", fallback: '[data-testid="tutor-landing"]',
    title: "Meet your tutor \u{1F9E0}",
    body: "Ask any clinical question — answers stream in live and earn you Lumens. It coaches Socratically, never just hands over the answer." },
  { id: "cases", route: "/cases", target: ".aurora-cases-map", fallback: '[data-testid="case-list"]',
    title: "Practice on real patients",
    body: "The eye itself filters cases. Each one is a full OSCE station — take a history, examine, and get a scored debrief." },
  { id: "flashcards", route: "/flashcards", target: ".flash-setup", fallback: '[data-testid="flash-fan"]',
    title: "Spin up a deck ⚡",
    body: "Pick any topic for a 10-card round — instant scoring, a growing streak flame, and a model answer on every card." },
  { id: "leaderboard", route: "/leaderboard", target: '[data-testid="podium"]', fallback: '[data-testid="leaderboard-root"]',
    title: "See where you stand \u{1F3C6}",
    body: "Climb the ranks, chase the podium, and compare within your own cohort." },
  { id: "analytics", route: "/analytics", target: ".aurora-analytics",
    title: "Your cohort insights \u{1F4CA}",
    body: "As a trainer you also get analytics here — track how your students are progressing." },
  { id: "finish", route: "/dashboard", target: null, confetti: true,
    title: "You're all set! \u{1F389}",
    body: "That's the tour. Come back daily to feed your streak — let's go!" },
];

/** The steps shown for a given role. Students don't see the trainer/admin-only analytics
    stop; everyone else does. Order is preserved. */
export function activeSteps(role: string | undefined): TourStep[] {
  const staff = role === "trainer" || role === "admin";
  return TOUR_STEPS.filter((s) => s.id !== "analytics" || staff);
}

export interface TourGateInput {
  isAuthenticated: boolean;
  isCheckInDone: boolean;
  customized: boolean | undefined;
  seen: boolean;
  pathname: string;
}

/** Whether the first-run tour should start right now. Fires only after all three onboarding
    gates clear (auth → daily check-in → Eyecon customized) and only on the dashboard
    hub. `customized` must be strictly true (undefined = still loading ⇒ don't fire,
    mirroring CheckInGuard's flash-loop guard). */
export function shouldStartTour(i: TourGateInput): boolean {
  return (
    i.isAuthenticated === true &&
    i.isCheckInDone === true &&
    i.customized === true &&
    i.seen === false &&
    i.pathname === "/dashboard"
  );
}
