"use client";
/* Ranked horizontal bars.

   Renders NOTHING when there are no rows — an empty track under a heading reads as a
   measured zero, so the owner shows its summary alone (D3). Do not "helpfully" render
   an empty state here; the caller pairs the prose. */
import { RAMP, type Hue } from "@/aurora/console/Panel";

/* Named CsBarRow, NOT BarRow — cohortAnalyticsView already exports a different `BarRow`
   (label/segments/readout/weak) and two same-named shapes in one screen is exactly how
   a raw segment value ends up rendered as a percentage. */
export interface CsBarRow { label: string; value: number; readout: string; hue: Hue }

/** `max` is the divisor the source panel was measured against — BarPanel.max is 1 for
    already-normalised 0–1 values and the largest count for raw-count bars. Pass it
    through; never re-derive a scale from the rows. */
export function BarList({ rows, max }: { rows: CsBarRow[]; max?: number }) {
  if (rows.length === 0) return null;
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);

  return (
    <div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0", fontSize: 11 }}>
          <span
            title={r.label}
            style={{
              width: 92, flex: "none", color: "var(--cs-ink-2)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {r.label}
          </span>
          <span style={{ flex: 1, height: 9, borderRadius: 5, background: "rgba(19,22,40,.07)", overflow: "hidden" }}>
            <span
              style={{
                display: "block", height: "100%", borderRadius: 5,
                width: `${Math.max(0, Math.min(100, (r.value / top) * 100))}%`,
                background: RAMP[r.hue][0],
              }}
            />
          </span>
          {/* Wide enough for a readout that carries its denominator ("68 (14)") — at 44px
              those wrapped onto a second line and broke the row rhythm. */}
          <span
            className="cs-num"
            style={{
              width: 64, flex: "none", textAlign: "right", fontWeight: 700,
              whiteSpace: "nowrap", color: RAMP[r.hue][0],
            }}
          >
            {r.readout}
          </span>
        </div>
      ))}
    </div>
  );
}
