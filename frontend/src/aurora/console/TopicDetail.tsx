"use client";
/* Per-topic drill-down.

   Reads the TopicGroupRow the Overview query ALREADY returned — this fires no
   additional request. That is the whole reason most-missed steps moved in here rather
   than sitting as an eleventh panel on Overview: progressive disclosure costs nothing.

   Every rate on TopicGroupRow.osce is number|null and 0-1 (unlike the trend endpoint's
   0-100). null renders "—", never 0% — at ~1 attempt per topic group a confident 0
   would be the most common single reading on the screen. */
import { useEffect } from "react";
import type { TopicGroupRow } from "@/hooks/useAdmin";
import { Icon } from "@/aurora/icons";
import { MiniStat } from "@/aurora/console/Panel";

const rate = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function TopicDetail({ topic, onClose }: { topic: TopicGroupRow; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const o = topic.osce;
  const fc = topic.flashcard;

  const cells: [string, string][] = [
    ["Attempts", String(o.attempts)],
    ["Students", String(o.students)],
    // avg_score is a mean of score_100 — already 0-100, so it is NOT multiplied.
    ["Avg score", o.avg_score === null ? "—" : String(Math.round(o.avg_score))],
    ["Pass rate", rate(o.pass_rate)],
    ["Safety fails", rate(o.safety_fail_rate)],
    // null — not 0.0 — when the flashcard table has nothing for this group. A 0% here
    // would read as "the cohort answers everything wrong".
    ["Flashcards", fc === null || fc.n === 0 || fc.accuracy === null ? "—" : `${Math.round(fc.accuracy)}%`],
  ];

  return (
    <div
      className="cs-modal-back"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="cs-modal" role="dialog" aria-modal="true"
        aria-label={`${topic.label} detail`} data-testid="cs-topic-detail"
        style={{ maxWidth: 560, gap: 0 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p className="cs-eyebrow" style={{ margin: 0 }}>Topic detail</p>
          <button type="button" className="cs-close" onClick={onClose} aria-label="Close">
            <Icon.close size={17} />
          </button>
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: "4px 0 12px", letterSpacing: "-.015em" }}>
          {topic.label}
        </h2>

        <div className="cs-strip" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          {cells.map(([k, v]) => <MiniStat key={k} label={k} value={v} />)}
        </div>

        {o.missed_top.length > 0 && (
          <>
            <p className="cs-eyebrow" style={{ marginTop: 16 }}>Most-missed steps</p>
            <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
              {o.missed_top.map((m) => (
                <li
                  key={m.step}
                  style={{
                    display: "flex", gap: 8, padding: "7px 0", fontSize: 12,
                    borderTop: "1px solid var(--cs-hair)", alignItems: "baseline",
                  }}
                >
                  <span>{m.step}</span>
                  {/* Each miss keeps the student denominator it was measured against. */}
                  <span className="cs-num" style={{ marginLeft: "auto", color: "var(--cs-coral)", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {m.count} miss{m.count === 1 ? "" : "es"} · {m.students} student{m.students === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {topic.low_confidence && (
          <p className="cs-note" style={{ marginTop: 12, marginBottom: 0 }}>
            Thin data — treat this topic’s figures as indicative, not settled.
          </p>
        )}
      </div>
    </div>
  );
}
