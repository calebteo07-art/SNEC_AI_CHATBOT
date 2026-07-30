/** Pure view-model for the at-risk list — no React, so it is Node-testable
    (mirrors cohortAnalyticsView.ts; the type import is erased before Node resolves it).

    The endpoint returns only `high`/`medium` bands (D12) already sorted worst-first
    (tools/supervisor/at_risk.py:172), but this re-sorts defensively: the list is polled
    every 30s (useAdmin.ts:9) and a tie that reorders between polls makes rows jump
    under the cursor. */
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
  scorePct: number;
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
        scorePct: Math.max(0, Math.min(100, score ?? 0)),
        reasons: (Array.isArray(r.reasons) ? r.reasons : [])
          // A zero-weight signal contributed nothing to the score, so showing it as a
          // "reason" would be a lie — a healthy 9-day streak is not why anyone is flagged.
          .filter((x) => (x?.weight ?? 0) > 0)
          .slice(0, MAX_REASONS),
      };
    })
    .sort((a, b) => {
      const band = bandRank(a.band) - bandRank(b.band);
      return band !== 0 ? band : b.scorePct - a.scorePct;
    });
}

function bandRank(band: string): number {
  const i = (BAND_ORDER as readonly string[]).indexOf(band);
  // An unrecognised band sorts last rather than throwing — a payload we do not
  // understand must not blank the whole panel.
  return i === -1 ? BAND_ORDER.length : i;
}
