// frontend/src/aurora/lib/stationHelp.ts
/* Help + briefing content for Virtual Patients. Pure data + one pure predicate — no React,
   no DOM.

   Students reported the whole feature was confusing (2026-07-29). The `?` card and the
   pre-flight briefing both read from here, so the system can never be described two
   different ways.

   BREVITY RULE (user, 2026-07-29: "too long winded and no one is gonna read all that"):
   the `?` card is FOUR one-line facts per surface — a five-second read, not a document.
   It used to be seven ~45-word sections and students skipped it wholesale. The real
   teaching now lives in the briefing, which plays on every station open; `?` is the
   at-a-glance reminder and the way to replay it. station_help_logic.mjs pins the
   character ceilings, because prose is what grows back.

   ANTI-SPOILER RULE: this explains MECHANICS (which pane, how steps tick, how scoring
   works). It never names a clinical action — that is the student's to recall. */

export interface HelpSection { heading: string; body: string }
export interface HelpContent { title: string; sections: HelpSection[] }

export const HELP: Record<"cases" | "station", HelpContent> = {
  cases: {
    title: "How Virtual Patients works",
    sections: [
      { heading: "Each patient is a full station",
        body: "Take a history, run your checks, write a handover, get a scored debrief." },
      { heading: "Filter by eye or by topic",
        body: "Click a region of the eye or pick a topic chip — one lens at a time, never both." },
      { heading: "Three tiers",
        body: "Clear a topic's Foundational patients to unlock its Developing and Advanced ones." },
      { heading: "Finish what you start",
        body: "Free to begin, but leaving before you submit your handover forfeits Lumens." },
    ],
  },
  station: {
    title: "How to use this station",
    sections: [
      { heading: "The checklist ticks itself",
        body: "Do the work and rows tick themselves. Upcoming steps stay hidden so you recall them." },
      { heading: "One pane is live at a time",
        body: "The highlighted pane is where you act. When a procedure is next, the composer locks." },
      { heading: "Type how you'd do it",
        body: "Procedures are graded on the technique you describe, and answered straight away." },
      { heading: "The handover is the grade",
        body: "Two schemes out of 50. Missing a critical safety step caps the judgement half." },
    ],
  },
};

/** Help for a surface; unknown surfaces fall back to the station rather than blanking a screen. */
export function helpFor(surface: string): HelpContent {
  return HELP[surface as "cases" | "station"] ?? HELP.station;
}

export interface BriefingBeat {
  id: string;
  /** CSS selector to spotlight. */
  target: string;
  title: string;
  body: string;
  /** Skip this beat on conversation-only cases, where the pane doesn't exist. */
  requiresEyebot?: boolean;
}

/** The pre-flight briefing: one beat per pane, plus the handover. Four is the ceiling —
    beyond that it stops being a cold open and becomes the grand tour, which already exists
    (tourSteps.ts). The handover beat earns its place because the `?` card no longer carries
    it and students kept missing that the handover is the thing being scored. */
export const BRIEFING_BEATS: BriefingBeat[] = [
  { id: "checklist", target: ".aurora-station-clscroll",
    title: "It ticks itself",
    body: "Do the work — rows tick on their own. Never tap them; upcoming steps stay hidden on purpose." },
  { id: "patient", target: '[data-testid="patient-pane"]',
    title: "Talk to your patient",
    body: "History, consent, explanations — one question at a time, like you would in clinic." },
  { id: "eyebot", target: '[data-testid="eyebot-pane"]', requiresEyebot: true,
    title: "Hands-on happens here",
    body: "When a procedure is next this panel lights up. Type how you'd actually perform it." },
  { id: "handover", target: ".aurora-station-submit-toggle",
    title: "This is what's graded",
    body: "Your handover carries the score — two schemes out of 50. Everything else is practice." },
];

/** How long a beat holds before the briefing advances itself. Long enough to read the beat
    AND look at the pane it spotlights, short enough that a student on their tenth station
    isn't held hostage. 2600 was the latter but not the former — the beats "flash by before
    i can read finish" (user, 2026-07-30). A beat is a title plus one line (~19 words) and
    the eye still has to travel to the spotlight and back, so it holds for ~5s; a veteran
    passes on it with Next → / Escape rather than waiting it out. */
export const BEAT_MS = 5200;

export interface AutoAdvanceInput {
  /** OS/app reduced-motion preference. */
  reduceMotion: boolean;
  /** pointer is over the briefing card. */
  hovered: boolean;
  /** the student took manual control (a click or a key) — sticky for the rest of the run. */
  manual: boolean;
  /** the tab/window has focus. */
  focused: boolean;
}

/** Whether the briefing may advance itself right now. The briefing plays on EVERY station
    open, so it self-advances by default — but any one of these reasons stops it outright,
    which is what keeps an auto-advancing dialog accessible (WCAG 2.2.2 pause/stop/hide).
    Reduced motion downgrades it to a plain manual walkthrough rather than removing it. */
export function shouldAutoAdvance(i: AutoAdvanceInput): boolean {
  return !i.reduceMotion && !i.hovered && !i.manual && i.focused;
}
