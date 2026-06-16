"use client";
/* EngagementBlock — a student's activity-at-a-glance for staff drill-downs. A
   weekly recap line + a 5-week activity heatmap, built purely from session
   timestamps. Lifted from the retired student Progress page so supervisors and
   admins keep the engagement signal that page used to carry. */
import { Heatmap } from "./Heatmap";

export interface EngagementSession { timestamp: string }

/* Bucket sessions into the last `days` calendar days, returning gradient
   intensities (0..1) and the count of days with any activity. */
function buildActivity(sessions: EngagementSession[], days = 35) {
  const counts = Array(days).fill(0) as number[];
  const now = Date.now();
  for (const s of sessions) {
    const t = new Date(s.timestamp).getTime();
    if (Number.isNaN(t)) continue;
    const diff = Math.floor((now - t) / 86_400_000);
    if (diff >= 0 && diff < days) counts[days - 1 - diff]++;
  }
  const max = Math.max(1, ...counts);
  return {
    values: counts.map((c) => (c === 0 ? 0 : 0.3 + 0.7 * (c / max))),
    active: counts.filter((c) => c > 0).length,
  };
}

export function EngagementBlock({ sessions }: { sessions: EngagementSession[] }) {
  const { values, active } = buildActivity(sessions);
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
      <Heatmap values={values} columns={7} />
    </div>
  );
}
