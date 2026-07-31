/** Signed delta vs cohort. The one new chart in P2 (spec §5.4) — BarSeries stacks a
 *  single flex track and clamps negatives, so it cannot express a below-cohort delta.
 *  aria-hidden with a text summary alongside; the a11y pass is P5. */
export function DivergingBar({ pct, tone }: { pct: number; tone: string }) {
  const width = `${Math.max(0, Math.min(100, pct)) / 2}%`;
  return (
    <div className="aurora-diverge" aria-hidden="true">
      <span className="aurora-diverge-axis" />
      <span className={`aurora-diverge-fill aurora-diverge-${tone}`} style={{ width }} />
    </div>
  );
}
