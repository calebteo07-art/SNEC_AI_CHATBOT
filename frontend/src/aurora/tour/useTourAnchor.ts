"use client";
/* DOM helpers for the tour overlay: resolve a step's anchor element (waiting for it to
   appear across route/animation transitions) and track its live viewport rect. */
import { useEffect, useState } from "react";

/** Resolve the first selector that appears within `timeoutMs`; resolves null on timeout
    (the overlay then falls back to a centered card — a missing anchor never traps the user). */
export function waitForElement(selectors: string[], timeoutMs = 4000): Promise<HTMLElement | null> {
  const pick = (): HTMLElement | null => {
    for (const s of selectors) {
      const el = document.querySelector<HTMLElement>(s);
      if (el) return el;
    }
    return null;
  };
  return new Promise((resolve) => {
    const first = pick();
    if (first) return resolve(first);
    let done = false;
    const finish = (el: HTMLElement | null) => {
      if (done) return;
      done = true;
      obs.disconnect();
      clearTimeout(timer);
      resolve(el);
    };
    const obs = new MutationObserver(() => {
      const el = pick();
      if (el) finish(el);
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

/** Track an element's getBoundingClientRect, updating on scroll/resize via rAF. */
export function useAnchorRect(el: HTMLElement | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!el) { setRect(null); return; }
    let raf = 0;
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    const onChange = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
    };
  }, [el]);
  return rect;
}
