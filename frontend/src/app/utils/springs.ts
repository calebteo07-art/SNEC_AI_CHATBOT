import type { Transition } from "motion/react";

export const springs = {
  snappy:  { type: "spring", stiffness: 500, damping: 30, mass: 0.6 } as Transition,
  gentle:  { type: "spring", stiffness: 280, damping: 30, mass: 1   } as Transition,
  bouncy:  { type: "spring", stiffness: 450, damping: 18, mass: 0.8 } as Transition,
  tactile: { type: "spring", stiffness: 600, damping: 20, mass: 0.5 } as Transition,
  float:   { type: "spring", stiffness: 180, damping: 25, mass: 1.2 } as Transition,
  slideUp: { type: "spring", stiffness: 350, damping: 28, mass: 0.9 } as Transition,
} as const;

export const screenVariant = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: springs.gentle },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export const tooltipVariant = {
  hidden:  { opacity: 0, scale: 0.88 },
  visible: { opacity: 1, scale: 1, transition: springs.bouncy },
  exit:    { opacity: 0, scale: 0.94, transition: { duration: 0.12 } },
};

export const toastVariant = {
  hidden:  { opacity: 0, y: 40, scale: 0.9 },
  visible: { opacity: 1, y: 0, scale: 1, transition: springs.bouncy },
  exit:    { opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.18 } },
};

export const feedbackBarVariant = {
  hidden:  { y: "100%", opacity: 0 },
  visible: { y: 0, opacity: 1, transition: springs.slideUp },
  exit:    { y: "100%", opacity: 0, transition: { duration: 0.2 } },
};

/* ── DARK ADAPTATION orchestration ──────────────────────────
 * Saccade timing: children dart in with 30–60ms offsets, the way the eye
 * jumps between fixation points. Nothing on screen is allowed to load flat.
 */

export const staggerContainer = (stagger = 0.045, delayChildren = 0) => ({
  hidden:  {},
  visible: { transition: { staggerChildren: stagger, delayChildren } },
});

export const saccadeItem = {
  hidden:  { opacity: 0, y: 14, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: springs.snappy },
};

/** Accommodation: the incoming screen pulls into focus. Tier-"high" only (blur). */
export const focusPull = {
  initial: { opacity: 0, scale: 0.985, filter: "blur(6px)" },
  enter:   { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const } },
  exit:    { opacity: 0, scale: 1.01, filter: "blur(4px)", transition: { duration: 0.16, ease: "easeIn" as const } },
};

/** Same accommodation cue without filter work, for low-tier devices. */
export const focusPullLite = {
  initial: { opacity: 0, scale: 0.985 },
  enter:   { opacity: 1, scale: 1, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const } },
  exit:    { opacity: 0, scale: 1.01, transition: { duration: 0.14, ease: "easeIn" as const } },
};
