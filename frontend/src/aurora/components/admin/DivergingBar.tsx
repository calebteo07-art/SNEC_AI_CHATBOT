/** Signed delta vs cohort. The one new chart in P2 (spec §5.4) — BarSeries stacks a
 *  single flex track and clamps negatives, so it cannot express a below-cohort delta.
 *  aria-hidden with a text summary alongside; the a11y pass is P5. */
import type { MasteryTone } from "./masteryView";

// MasteryTone, not string: only the four known tones have CSS, and .aurora-diverge-fill
// sets no left/right of its own — so an unstyled tone would fall back to static position
// and draw a bar from the LEFT EDGE of the track, which reads as a large below-cohort
// delta. The type is what stops that reaching a trainer.
export function DivergingBar({ pct, tone }: { pct: number; tone: MasteryTone }) {
  const width = `${Math.max(0, Math.min(100, pct)) / 2}%`;
  return (
    <div className="aurora-diverge" aria-hidden="true">
      <span className="aurora-diverge-axis" />
      <span className={`aurora-diverge-fill aurora-diverge-${tone}`} style={{ width }} />
    </div>
  );
}
