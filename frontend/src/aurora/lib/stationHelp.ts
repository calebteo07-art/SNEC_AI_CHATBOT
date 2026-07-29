// frontend/src/aurora/lib/stationHelp.ts
/* Help + coach-mark content for Virtual Patients. Pure data — no React, no DOM.

   Students reported the whole feature was confusing (2026-07-29). The `?` modal and the
   first-run coach-mark both read from here, so the system can never be described two
   different ways. Copy lives in one file for the same reason tourSteps.ts does.

   ANTI-SPOILER RULE: this explains MECHANICS (which pane, how steps tick, how scoring
   works). It never names a clinical action — that is the student's to recall. */

export interface HelpSection { heading: string; body: string }
export interface HelpContent { title: string; sections: HelpSection[] }

export const HELP: Record<"cases" | "station", HelpContent> = {
  cases: {
    title: "How Virtual Patients works",
    sections: [
      { heading: "What this is",
        body: "Each virtual patient is a full OSCE station. You take a history, run the checks you'd really run, then write a handover — and get a scored debrief with specific feedback." },
      { heading: "Choosing a patient",
        body: "Filter by clicking a region of the eye, or by picking a topic chip. One lens at a time — choosing a topic clears the eye region, and vice-versa." },
      { heading: "The three tiers",
        body: "Foundational, Developing and Advanced. Work through a topic's Foundational patients to unlock the harder ones in that topic." },
      { heading: "What it costs",
        body: "Nothing to start. But once you're in a station, leaving before you submit your handover forfeits Lumens — so start one when you have time to finish it." },
    ],
  },
  station: {
    title: "How to use this station",
    sections: [
      { heading: "The checklist tracks you — you don't tick it",
        body: "Steps tick themselves as you work: talk to the patient and the examiner marks off what you genuinely covered; perform a procedure in the EyeBot panel and it ticks there. Upcoming steps stay hidden on purpose, so you recall what to ask instead of reading it off a list." },
      { heading: "Whose turn is it",
        body: "The live pane is highlighted and says so. When it's the patient's turn, talk to them. When a hands-on procedure is next, the patient composer locks and you work in the EyeBot panel instead." },
      { heading: "Talking to the patient",
        body: "Ask like you would in clinic — one thing at a time. They answer only what you ask, in their own words. If you're sure you covered a step and it hasn't ticked, use “Examiner didn't catch that?” under the composer." },
      { heading: "Hands-on procedures",
        body: "Pick a procedure chip, then type how you'd actually perform it. EyeBot returns the reading and grades your technique against the model answer straight away. A few mechanical steps just tick on one click." },
      { heading: "Time",
        body: "Each case shows a countdown from its expected length. It turns amber near the end and red when it runs out, but it never cuts you off — it's there to build exam pace." },
      { heading: "The handover",
        body: "Write what you found and what you'd do next, within your role — you don't diagnose or prescribe. If nothing is urgent, say so: “routine, patient follows appointment time” is a complete answer." },
      { heading: "How you're scored",
        body: "Two schemes out of 50: Consultation & Technique, and Clinical Judgement & Safety. The debrief shows the sub-scores behind each one and why. Missing a critical safety step caps the judgement half." },
    ],
  },
};

/** Help for a surface; unknown surfaces fall back to the station rather than blanking a screen. */
export function helpFor(surface: string): HelpContent {
  return HELP[surface as "cases" | "station"] ?? HELP.station;
}

export interface CoachBeat {
  id: string;
  /** CSS selector to spotlight. */
  target: string;
  title: string;
  body: string;
  /** Skip this beat on conversation-only cases, where the pane doesn't exist. */
  requiresEyebot?: boolean;
}

/** First-run coach-mark: three beats, one per pane. More than three is a tour, not a
    coach-mark — and the account-level grand tour already exists (tourSteps.ts). */
export const COACH_BEATS: CoachBeat[] = [
  { id: "checklist", target: ".aurora-station-clscroll",
    title: "This tracks itself",
    body: "You can't tick these — do the work and they tick. Steps you haven't reached stay hidden so you recall them yourself." },
  { id: "patient", target: '[data-testid="patient-pane"]',
    title: "Talk to your patient here",
    body: "History, consent, explanations — ask one thing at a time, like you would in clinic." },
  { id: "eyebot", target: '[data-testid="eyebot-pane"]', requiresEyebot: true,
    title: "Hands-on procedures happen here",
    body: "When a procedure is next, this panel lights up. Pick it, then type how you'd perform it." },
];
