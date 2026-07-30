/** Pure view-model for the at-risk list — no React, so it is Node-testable
    (mirrors cohortAnalyticsView.ts; the type import is erased before Node resolves it).

    Ordering here does NOT add a guarantee the wire lacks: at_risk.py:172 already sorts by
    `(-risk_score, student_id)`, a full order with no ties, and since bands are pure score
    thresholds, band-then-score is equivalent to score-desc on every payload the endpoint
    can emit. What it adds is INDEPENDENCE — the panel states its own ordering instead of
    inheriting one, so a future endpoint change cannot silently reorder the UI.

    The reason sort below is different: that one IS load-bearing, because this module
    truncates. */
import type { AtRiskRow, RiskReason } from "@/hooks/useAdmin";

export const BAND_ORDER = ["high", "medium", "low", "no_data"] as const;

/** How many reasons a row shows. Three is what fits one line at the narrowest
 *  supported width; the rest are one click away in the drill-down. */
const MAX_REASONS = 3;

export interface RiskRowView {
  studentId: string;
  idLabel: string;
  band: string;
  /** null risk_score renders "—", never "0" — a 0 reads as "lowest risk in the cohort". */
  scoreLabel: string;
  /** Sort key only — nothing renders this. A null score sorts last within its band,
   *  which is right: "we know nothing" is not "worst". */
  sortScore: number;
  reasons: RiskReason[];
}

export function riskRows(rows: AtRiskRow[] | null | undefined): RiskRowView[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => {
      const score = typeof r.risk_score === "number" ? r.risk_score : null;
      const id = String(r.student_id ?? "");
      return {
        studentId: id,
        // Ellipsis only when something was actually cut. Production ids are often
        // short ("S001"), and "S001…" claims a truncation that did not happen.
        idLabel: id.length > 12 ? `${id.slice(0, 12)}…` : id,
        band: String(r.band ?? ""),
        scoreLabel: score === null ? "—" : String(score),
        sortScore: Math.max(0, Math.min(100, score ?? 0)),
        reasons: (Array.isArray(r.reasons) ? r.reasons : [])
          // A zero-weight signal contributed nothing to the score, so showing it as a
          // "reason" would be a lie — a healthy 9-day streak is not why anyone is flagged.
          .filter((x) => (x?.weight ?? 0) > 0)
          // Sort before truncating. risk_model.py:242 already returns these heaviest-first,
          // but slicing trusted wire order is the one destructive decision this module
          // makes: reorder upstream and a trainer silently loses the safety fail and keeps
          // three trivia.
          .sort((a, b) => (b?.weight ?? 0) - (a?.weight ?? 0))
          .slice(0, MAX_REASONS),
      };
    })
    .sort((a, b) => {
      const band = bandRank(a.band) - bandRank(b.band);
      return band !== 0 ? band : b.sortScore - a.sortScore;
    });
}

function bandRank(band: string): number {
  const i = (BAND_ORDER as readonly string[]).indexOf(band);
  // An unrecognised band sorts last rather than throwing — a payload we do not
  // understand must not blank the whole panel.
  return i === -1 ? BAND_ORDER.length : i;
}
