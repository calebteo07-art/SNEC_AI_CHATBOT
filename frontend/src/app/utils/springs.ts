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
