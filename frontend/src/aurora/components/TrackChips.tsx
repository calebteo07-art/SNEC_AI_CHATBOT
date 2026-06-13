"use client";
/* TrackChips — All · OA · OT · PSA filter. The active chip carries the animated
   Gemini sweep; the rest are outlined. */
export type TrackFilter = "All" | "OA" | "OT" | "PSA";

const TRACKS: TrackFilter[] = ["All", "OA", "OT", "PSA"];

export function TrackChips({ value, onChange }: { value: TrackFilter; onChange: (t: TrackFilter) => void }) {
  return (
    <div className="aurora-chips" role="tablist" aria-label="Filter by track">
      {TRACKS.map((t) => {
        const active = t === value;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active}
            className={`aurora-chip ${active ? "aurora-flow" : ""}`}
            data-active={active}
            onClick={() => onChange(t)}
          >
            <span>{t}</span>
          </button>
        );
      })}
    </div>
  );
}
