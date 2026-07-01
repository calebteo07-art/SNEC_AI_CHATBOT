"use client";
/* LiquidLoading — a calm Gemini "liquid" equalizer. PURE CSS: each bar waves via a
   compositor-driven transform keyframe (staggered per bar), so it stays smooth even
   while the deck is fetching or the flip is being prepared. The old version drove 7
   bars × 2 state arrays from a setInterval (~31 React re-renders/sec, each repainting
   blurred/shadowed gradients) — that main-thread churn was the choppiness. Styles and
   the reduced-motion freeze live in aurora.css (`.liq*`). */

const BARS = 7;

const LiquidLoading = () => (
  <div className="liq" role="status" aria-label="Loading">
    {Array.from({ length: BARS }).map((_, i) => (
      <span key={i} className="liq-bar" style={{ animationDelay: `${i * 0.11}s` }} />
    ))}
  </div>
);

export default LiquidLoading;
