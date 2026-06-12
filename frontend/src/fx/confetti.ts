"use client";
/* PHOTOPIC · confetti wrapper
 * canvas-confetti injects its own <canvas> with no aria attributes and no
 * reduced-motion awareness. Every call site goes through here instead:
 * the library's own reduced-motion kill-switch is always on, and the
 * injected canvas is marked decorative the frame after it appears.
 */
import confettiLib, { type Options } from "canvas-confetti";

export function confetti(opts: Options) {
  void confettiLib({ disableForReducedMotion: true, ...opts });
  requestAnimationFrame(() => {
    document
      .querySelectorAll("canvas:not([aria-hidden])")
      .forEach((c) => c.setAttribute("aria-hidden", "true"));
  });
}
