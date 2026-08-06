"use client";
/* ChatField — the live electric constellation behind the tutor thread. A self-contained
   <canvas> particle field (drifting nodes + proximity links) in electric indigo, sized to
   its parent .aurora-chat. Vanilla rAF (no GSAP — MotionProvider isn't mounted), client-only
   so it never touches the server event loop, and frozen to a single static frame under
   reduced motion. */
import { useEffect, useRef } from "react";

type Pt = { x: number; y: number; vx: number; vy: number };

export function ChatField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "reduce";

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const LINK = 122;
    const PR = 168; // pointer-influence radius
    // Both radii are only ever used as thresholds, so compare SQUARED distances and take the
    // root just for the few pairs that actually draw. Same picture, and it matters: the link
    // pass is O(n²) — ~7,750 pairs a frame at 1440x900 — and Math.hypot is ~48x the cost of
    // dx*dx+dy*dy because it rescales every call to stay overflow-safe, which nothing here
    // needs at canvas coordinates.
    const LINK2 = LINK * LINK;
    const PR2 = PR * PR;
    let W = 0;
    let H = 0;
    let raf = 0;
    let pts: Pt[] = [];
    const ptr = { x: -9999, y: -9999, on: false };

    const size = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const init = () => {
      const n = Math.min(132, Math.max(28, Math.round((W * H) / 8600)));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      }));
    };

    const render = () => {
      ctx.clearRect(0, 0, W, H);

      // Soft electric bloom that follows the pointer.
      if (ptr.on) {
        const g = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, PR);
        g.addColorStop(0, "rgba(91, 91, 255, 0.13)");
        g.addColorStop(1, "rgba(91, 91, 255, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(ptr.x - PR, ptr.y - PR, PR * 2, PR * 2);
      }

      // Links — denser web, brightened near the pointer.
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 1; b < pts.length; b++) {
          const dx = pts[a].x - pts[b].x;
          const dy = pts[a].y - pts[b].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK2) {
            const d = Math.sqrt(d2);
            let alpha = 0.3 * (1 - d / LINK);
            if (ptr.on) {
              const ax = pts[a].x - ptr.x, ay = pts[a].y - ptr.y;
              const bx = pts[b].x - ptr.x, by = pts[b].y - ptr.y;
              const near2 = Math.min(ax * ax + ay * ay, bx * bx + by * by);
              if (near2 < PR2) alpha += 0.4 * (1 - Math.sqrt(near2) / PR) * (1 - d / LINK);
            }
            ctx.strokeStyle = `rgba(99, 99, 255, ${alpha})`;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(pts[a].x, pts[a].y);
            ctx.lineTo(pts[b].x, pts[b].y);
            ctx.stroke();
          }
        }
      }

      // Nodes — glowing electric dots, brighter + larger near the pointer.
      ctx.shadowColor = "rgba(91, 91, 255, 0.9)";
      ctx.shadowBlur = 6;
      for (const p of pts) {
        const near = ptr.on && (p.x - ptr.x) ** 2 + (p.y - ptr.y) ** 2 < PR2;
        ctx.fillStyle = near ? "rgba(150, 150, 255, 0.95)" : "rgba(99, 99, 255, 0.72)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, near ? 2.4 : 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };

    /* A decoration may never starve the page it decorates. rAF re-arms every frame no matter
       how long the last one took, so on hardware that cannot afford a frame — a GPU-less CI
       runner, a cheap tablet — this loop simply keeps the main thread and never gives it
       back. The composer below then can't take input: that is what left the tutor field
       unfillable for a full 30s in CI (aurora_assert.mjs:435), with the renderer too busy to
       answer at all rather than the field being disabled. So hold the loop to ~1/DUTY of
       wall-clock.

       Charge the budget from the OBSERVED frame interval, not from our own JS: most of the
       cost is rasterising this full-bleed canvas over the animated backdrop, and that lands
       after render() has returned. A healthy machine is vsync-bound and mostly idle between
       frames, so subtract one frame period before charging — there `gap` never binds and the
       field still runs at the full refresh rate, unchanged. */
    const DUTY = 4;
    const VSYNC = 1000 / 60;
    let gap = 0;      // ms to sit out after a draw
    let drawnAt = 0;

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (drawnAt && ts - drawnAt < gap) return;
      const frameMs = drawnAt ? ts - drawnAt - gap : 0;
      drawnAt = ts;

      const t0 = performance.now();
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }
      render();
      const busy = Math.max(performance.now() - t0, frameMs - VSYNC);
      // The ceiling only exists to stop one freak measurement parking the field forever, so
      // it has to stay ABOVE any gap the duty rule can legitimately ask for. A tighter cap
      // silently repeals the rule exactly when it is needed: clamped to 1s, a frame costing
      // ~850ms still got redrawn every second — 85% of the thread, right back where we
      // started, and only on the slowest machines.
      gap = Math.min(busy * (DUTY - 1), 8000);
    };

    size();
    init();
    if (reduce) render();
    else raf = requestAnimationFrame(loop);

    const onResize = () => {
      size();
      init();
      if (reduce) render();
    };
    /* A hidden tab pauses rAF entirely, so the first frame back reports the whole absence as
       one enormous interval. That is elapsed time, not work, and charging it would sit the
       field out for the full ceiling every time the student switches back. Drop the baseline
       instead and measure again from the next frame. */
    const onVisibility = () => { drawnAt = 0; gap = 0; };
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ptr.x = e.clientX - r.left;
      ptr.y = e.clientY - r.top;
      ptr.on = ptr.x >= 0 && ptr.x <= W && ptr.y >= 0 && ptr.y <= H;
    };
    window.addEventListener("resize", onResize);
    if (!reduce) {
      window.addEventListener("pointermove", onPointer);
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="aurora-chat-field" aria-hidden="true" />;
}
