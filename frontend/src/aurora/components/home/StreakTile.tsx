/* StreakTile — the daily-streak hero co-star: a two-tone flame + big streak number, the
   whole current month as a calendar, and the next-tier nudge. Reads progress.streak_detail;
   renders nothing until it arrives. (The daily-goal % ring and the seven-dot week strip were
   removed 2026-07-29 — the month calendar supersedes the week.) */
import type { StreakDetail } from "@/hooks/useProgress";
import { Icon } from "./HomeIcons";
import { MonthCalendar } from "./MonthCalendar";

export function StreakTile({ detail }: { detail?: StreakDetail }) {
  if (!detail) return null;

  return (
    <section className="hm-streak" data-testid="streak-tile" aria-label={`${detail.current}-day streak`}>
      <div className="hm-sh">
        <span className="hm-t"><Icon name="flame" /> Daily streak</span>
      </div>

      <div className="hm-big">
        <Icon name="flame" className="hm-flame ico" />
        <div>
          <div className="hm-snum disp">{detail.current}</div>
          <div className="hm-slbl">day streak</div>
        </div>
      </div>

      <MonthCalendar month={detail.month} />

      <div className="hm-nexttier">
        {detail.next_tier ? (
          <>
            <span className="hm-nl">Next: <b>{detail.next_tier}</b></span>
            <span className="hm-tag">{detail.to_next} day{detail.to_next === 1 ? "" : "s"} to go</span>
          </>
        ) : (
          <span className="hm-nl">Top tier reached — <b>{detail.tier}</b></span>
        )}
      </div>
    </section>
  );
}
