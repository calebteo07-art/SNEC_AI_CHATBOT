"use client";
/* Payoff — the back-face landing. Big verdict headline, a points tick-up
   (base × combo multiplier), a combo flare when the multiplier > 1, and a
   self-terminating particle burst on a canvas (confetti on a hit scaled by the
   multiplier; a calm shimmer on a miss — never punishing). No library, one rAF. */
import { useEffect, useRef } from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { comboMultiplier } from "./types";

export function Payoff({ correct, combo, basePoints }: { correct: boolean; combo: number; basePoints: number }) {
  const mult = correct ? comboMultiplier(combo) : 1;
  const points = correct ? basePoints * mult : basePoints;
  const { ref, display } = useCountUp<HTMLSpanElement>(points, { duration: 900, format: (n) => `+${Math.round(n)}` });
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cv = canvas.current; if (!cv || reduced) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; ctx.scale(dpr, dpr);
    // Bright green on a hit, intense red on a miss — fewer, smaller, gentler particles
    // so the payoff reads premium, not like a slot-machine jackpot.
    const hue = correct ? 140 : 4;
    const n = correct ? 18 + mult * 10 : 10;
    type P = { x: number; y: number; vx: number; vy: number; life: number; size: number; hue: number };
    const ps: P[] = Array.from({ length: n }, () => ({
      x: w / 2, y: h * 0.42,
      vx: (Math.random() - 0.5) * (correct ? 5 : 1.8),
      vy: (Math.random() - (correct ? 0.85 : 0.4)) * (correct ? 5.2 : 2.6),
      life: 1, size: 1.6 + Math.random() * (correct ? 2.6 : 1.6),
      hue: hue + (Math.random() - 0.5) * 36,
    }));
    let raf = 0; const t0 = performance.now();
    const draw = (t: number) => {
      const el = t - t0; ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy; p.vy += correct ? 0.12 : 0.03; p.vx *= 0.99;
        p.life = Math.max(0, 1 - el / 1200);
        ctx.globalAlpha = p.life; ctx.fillStyle = `hsl(${p.hue} 85% 62%)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill();
      }
      if (el < 1200) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [correct, mult]);

  return (
    <div className={`flash-payoff ${correct ? "is-right" : "is-wrong"}`} data-testid="flash-payoff">
      <canvas ref={canvas} className="flash-payoff-fx" aria-hidden />
      <div className="flash-payoff-row">
        <p className="flash-payoff-verdict">{correct ? "Correct" : "Review this"}</p>
        {mult > 1 && <span className="flash-combo" data-testid="flash-combo">combo ×{mult} · {combo} streak</span>}
        <span ref={ref} className="flash-payoff-points">{display}</span>
      </div>
    </div>
  );
}
