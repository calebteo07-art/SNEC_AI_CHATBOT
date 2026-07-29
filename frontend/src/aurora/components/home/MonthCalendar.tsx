/* MonthCalendar — the whole current month on the daily-streak card (it replaced the
   seven-dot week strip: a week is too small a window to read a habit). Seven columns,
   one cell per real day, carrying the same state vocabulary the week strip used:
   done / today / missed / rest / rest-done / upcoming.

   Every cell keeps its DATE NUMBER — state is carried by the fill, not by swapping the
   number for an icon, or it stops being a calendar you can read a date off. */
import type { StreakDay } from "@/hooks/useProgress";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const LABELS: Record<string, string> = {
  done: "checked in", "rest-done": "checked in (rest day)", today: "today",
  missed: "missed", rest: "rest day", upcoming: "upcoming",
};

/* Label from the ISO string by slicing, never `new Date(iso)` — that parses as UTC and
   would show the wrong month for the first/last day of a month in Singapore time. */
function monthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1] ?? ""} ${y}`;
}

export function MonthCalendar({ month }: { month?: StreakDay[] }) {
  if (!month?.length) return null;

  /* Leading blanks so the 1st lands under its real weekday column — taken from the
     cell's own day NAME, which the server already resolved in app time. */
  const lead = Math.max(0, DAY_NAMES.indexOf(month[0].day));
  const doneCount = month.filter((d) => d.state === "done" || d.state === "rest-done").length;

  return (
    <div className="hm-cal" data-testid="month-calendar">
      <div className="hm-calhead">
        <span className="hm-calmonth">{monthLabel(month[0].date)}</span>
        <span className="hm-caldone">{doneCount} day{doneCount === 1 ? "" : "s"} this month</span>
      </div>
      <ol className="hm-caldows" aria-hidden>
        {DAY_NAMES.map((d, i) => <li key={d}>{"MTWTFSS"[i]}</li>)}
      </ol>
      <ol className="hm-calgrid">
        {Array.from({ length: lead }, (_, i) => (
          <li key={`pad-${i}`} className="hm-calpad" aria-hidden />
        ))}
        {month.map((d) => (
          <li key={d.date} className="hm-calday" data-state={d.state}
            aria-label={`${d.date} — ${LABELS[d.state] ?? d.state}`}>
            <span className="hm-caldot">{Number(d.date.slice(8))}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
