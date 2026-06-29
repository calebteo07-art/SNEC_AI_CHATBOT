"use client";
/* EngravingField — faint education / eye-care line-art glyphs (eye, eye-chart,
   glasses, drop, graduation cap, open book, lightbulb, brain, DNA, pulse, atom)
   etched across the activity canvas, drifting with rapid Brownian motion. DOM
   nodes, one RAF loop, transform-only. Static + frozen under reduced motion.
   Decorative — themed for OA/OT/PSA allied-health learners, not doctors. */
import { useEffect, useRef } from "react";

// Inner SVG (24×24, stroke = currentColor). Non-scaling strokes keep the engraved
// line thin no matter how large a glyph is spawned.
const GLYPHS = [
  /* eye        */ `<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/>`,
  /* eye chart  */ `<rect x="4" y="3" width="16" height="18" rx="1.6"/><path d="M8 7h8"/><path d="M8.5 11h7"/><path d="M9.5 15h5"/><path d="M10.5 18h3"/>`,
  /* glasses    */ `<circle cx="6.5" cy="14" r="3.4"/><circle cx="17.5" cy="14" r="3.4"/><path d="M9.9 13.3c1-1 3.2-1 4.2 0"/><path d="M3.1 12 1.6 9.6"/><path d="M20.9 12l1.5-2.4"/>`,
  /* eye drop   */ `<path d="M12 3s6 6.8 6 10.6a6 6 0 0 1-12 0C6 9.8 12 3 12 3Z"/><path d="M9.5 14.6a2.5 2.5 0 0 0 2.5 2.4"/>`,
  /* grad cap   */ `<path d="M2 8.5 12 4l10 4.5-10 4.4L2 8.5Z"/><path d="M6 10.6V15c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.4"/><path d="M22 8.7v5"/>`,
  /* open book  */ `<path d="M12 6C10 4.4 7 4.1 4 4.7V18c3-.6 6-.3 8 1.3 2-1.6 5-1.9 8-1.3V4.7C17 4.1 14 4.4 12 6Z"/><path d="M12 6v13.3"/>`,
  /* lightbulb  */ `<path d="M9.2 17.4a5.5 5.5 0 1 1 5.6 0c-.6.4-.9.9-.9 1.6v.4h-3.8v-.4c0-.7-.3-1.2-.9-1.6Z"/><path d="M10 21h4"/>`,
  /* brain      */ `<path d="M12 5c-1-1.3-3.3-1.2-4 .4-1.6-.2-2.8 1.4-2.2 2.9-1.3 1-1 3 .5 3.6-.3 1.6 1.3 2.9 2.8 2.3.5 1.2 2.3 1.3 3 .2"/><path d="M12 5c1-1.3 3.3-1.2 4 .4 1.6-.2 2.8 1.4 2.2 2.9 1.3 1 1 3-.5 3.6.3 1.6-1.3 2.9-2.8 2.3-.5 1.2-2.3 1.3-3 .2"/><path d="M12 5v11.6"/>`,
  /* dna        */ `<path d="M8 3c0 4.2 8 5.8 8 9s-8 4.8-8 9"/><path d="M16 3c0 4.2-8 5.8-8 9s8 4.8 8 9"/><path d="M9.2 6h5.6M8.4 10h7.2M8.4 14h7.2M9.2 18h5.6"/>`,
  /* pulse      */ `<path d="M2 12h4l2.2-5 3 9 2.3-6 1.4 2H22"/>`,
  /* atom       */ `<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="9.2" ry="3.6"/><ellipse cx="12" cy="12" rx="9.2" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.2" ry="3.6" transform="rotate(120 12 12)"/>`,
];

const SVG_OPEN =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">`;

export function EngravingField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const W = () => host.clientWidth || 1200;
    const H = () => host.clientHeight || 800;
    type G = { el: HTMLSpanElement; s: number; rot: number; x: number; y: number; vx: number; vy: number };

    // One of each glyph plus a few repeats, shuffled, so the canvas reads varied.
    const picks = [...GLYPHS.keys(), 0, 5, 8].sort(() => Math.random() - 0.5);
    const items: G[] = picks.map((gi) => {
      const s = 42 + Math.random() * 46; // 42–88px
      const el = document.createElement("span");
      el.className = "flash-engraving";
      el.style.width = el.style.height = `${s}px`;
      el.style.opacity = (0.12 + Math.random() * 0.06).toFixed(3);
      el.innerHTML = `${SVG_OPEN}${GLYPHS[gi]}</svg>`;
      host.appendChild(el);
      const a = Math.random() * 6.28, sp = 0.7 + Math.random() * 1.1;
      return {
        el, s, rot: Math.random() * 44 - 22,
        x: Math.random() * (W() - s), y: Math.random() * (H() - s),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      };
    });
    const draw = (g: G) =>
      (g.el.style.transform = `translate(${g.x.toFixed(1)}px,${g.y.toFixed(1)}px) rotate(${g.rot}deg)`);
    items.forEach(draw);
    if (reduced) return () => items.forEach((g) => g.el.remove());

    let raf = 0;
    const tick = () => {
      const w = W(), h = H();
      for (const g of items) {
        g.vx += (Math.random() - 0.5) * 1.0; g.vy += (Math.random() - 0.5) * 1.0; // rapid jitter
        g.vx *= 0.96; g.vy *= 0.96;
        const sp = Math.hypot(g.vx, g.vy), mx = 3.0; // rapid cap
        if (sp > mx) { g.vx *= mx / sp; g.vy *= mx / sp; }
        g.x += g.vx; g.y += g.vy;
        if (g.x < 0) { g.x = 0; g.vx = Math.abs(g.vx); } else if (g.x > w - g.s) { g.x = w - g.s; g.vx = -Math.abs(g.vx); }
        if (g.y < 0) { g.y = 0; g.vy = Math.abs(g.vy); } else if (g.y > h - g.s) { g.y = h - g.s; g.vy = -Math.abs(g.vy); }
        draw(g);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); items.forEach((g) => g.el.remove()); };
  }, []);

  return <div ref={ref} className={`flash-engravings ${className}`} aria-hidden="true" />;
}
