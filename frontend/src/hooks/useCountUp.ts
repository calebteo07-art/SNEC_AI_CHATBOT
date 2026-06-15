"use client";
/* useCountUp — eases a number up to target with rAF when its element scrolls into
   view. Reduced motion (OS pref OR the profile toggle mirrored to html[data-motion])
   sets the final value immediately. Attach `ref` to the trigger element; render
   `display` for the formatted value. */
import { useEffect, useRef, useState } from "react";

export function useCountUp<T extends HTMLElement = HTMLDivElement>(
  target: number,
  opts?: { duration?: number; format?: (n: number) => string },
) {
  const duration = opts?.duration ?? 1100;
  const format = opts?.format ?? ((n) => Math.round(n).toLocaleString());
  const [display, setDisplay] = useState(() => format(0));
  const ref = useRef<T | null>(null);
  const started = useRef(false);
  useEffect(() => {
    started.current = false;
    const el = ref.current;
    const reduce = document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = () => {
      if (started.current) return;
      started.current = true;
      if (reduce) { setDisplay(format(target)); return; }
      const t0 = performance.now();
      const step = (t: number) => {
        let p = Math.min(1, (t - t0) / duration);
        p = 1 - Math.pow(1 - p, 3);
        setDisplay(format(target * p));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!el) { run(); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { run(); io.disconnect(); break; }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return { ref, display };
}
