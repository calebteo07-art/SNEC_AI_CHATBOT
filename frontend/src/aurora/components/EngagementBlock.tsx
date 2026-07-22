"use client";
/* EngagementBlock — a student's activity-at-a-glance for staff drill-downs: a
   weekly recap line + a 5-week calendar heatmap keyed to REAL dates and weekday
   columns (Sun→Sat), built purely from session timestamps. Lives in the dark
   admin student drill-down. Lifted from the retired student Progress page,
   then rebuilt as a proper dated calendar so the grid reads as a calendar, not
   scattered blocks. */
import type { CSSProperties } from "react";

export interface EngagementSession { timestamp: string }

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Cell { date: number; month: number; count: number; value: number; today: boolean; future: boolean }

/* Build a weekday-aligned 5-week grid (Sun→Sat rows, ending with the current
   week). Each cell is a real calendar day carrying its session count as gradient
   intensity (0..1); `active` is the count of past days with any activity. */
function buildCalendar(sessions: EngagementSession[]) {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const t = new Date(s.timestamp);
    if (Number.isNaN(t.getTime())) continue;
    const key = t.toDateString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const max = Math.max(1, ...counts.values());

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - 28); // Sunday, 4 weeks before this week's Sunday

  const cells: Cell[] = [];
  let active = 0;
  for (let i = 0; i < 35; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const count = counts.get(d.toDateString()) ?? 0;
    const future = d.getTime() > today.getTime();
    if (count > 0 && !future) active++;
    cells.push({
      date: d.getDate(),
      month: d.getMonth(),
      count,
      value: count === 0 ? 0 : 0.3 + 0.7 * (count / max),
      today: d.getTime() === today.getTime(),
      future,
    });
  }
  return { cells, active };
}

export function EngagementBlock({ sessions }: { sessions: EngagementSession[] }) {
  const { cells, active } = buildCalendar(sessions);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const weekSessions = sessions.filter((s) => {
    const t = new Date(s.timestamp).getTime();
    return !Number.isNaN(t) && t >= weekAgo;
  });
  const weekDays = new Set(
    weekSessions.map((s) => new Date(s.timestamp).toDateString()),
  ).size;

  return (
    <div>
      <div className="aurora-prog-card-head">
        <p className="aurora-activity-head">Engagement · last 5 weeks</p>
        <span className="aurora-prog-count">{active} active days</span>
      </div>
      <p className="aurora-muted" style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
        {weekSessions.length > 0
          ? `${weekSessions.length} session${weekSessions.length === 1 ? "" : "s"} across ${weekDays} active day${weekDays === 1 ? "" : "s"} in the last 7 days.`
          : "No sessions in the last 7 days."}
      </p>

      <div
        className="aurora-cal"
        role="img"
        aria-label={`Activity calendar: ${active} active days in the last 5 weeks`}
      >
        <div className="aurora-cal-dow" aria-hidden>
          {DOW.map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="aurora-cal-grid" aria-hidden>
          {cells.map((c, i) => (
            <span
              key={i}
              className={
                "aurora-cal-cell" +
                (c.count > 0 ? " is-active" : "") +
                (c.today ? " is-today" : "") +
                (c.future ? " is-future" : "")
              }
              style={{ "--v": c.value } as CSSProperties}
              title={`${MONTHS[c.month]} ${c.date} · ${c.count} session${c.count === 1 ? "" : "s"}`}
            >
              {c.date === 1 && <em className="aurora-cal-mo">{MONTHS[c.month]}</em>}
              <b className="aurora-cal-date">{c.date}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
