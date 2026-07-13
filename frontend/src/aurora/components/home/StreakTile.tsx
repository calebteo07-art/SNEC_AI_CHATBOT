/* StreakTile — the daily-streak hero co-star: a two-tone flame + big streak number,
   the week as jewel dots (done → check, rest → moon, today → ring), a small daily-goal
   ring, and the next-tier nudge. Reads progress.streak_detail; renders nothing until it
   arrives. */
import type { StreakDay, StreakDetail } from "@/hooks/useProgress";
import { Icon } from "./HomeIcons";

function WeekDot({ d }: { d: StreakDay }) {
  const filled = d.state === "done" || d.state === "rest-done";
  const isRest = d.state === "rest" || d.state === "rest-done";
  const cls = "hm-wd" + (filled ? " on" : d.state === "today" ? " today" : "");
  return (
    <li className={cls}>
      <span className="hm-wdot">
        {filled ? <Icon name="check" /> : isRest ? <Icon name="moon" /> : null}
      </span>
      <span className="hm-wl">{d.day.slice(0, 1)}</span>
    </li>
  );
}

export function StreakTile({
  detail,
  xpToday,
  dailyGoal,
}: {
  detail?: StreakDetail;
  xpToday: number;
  dailyGoal: number;
}) {
  if (!detail) return null;
  const pct = dailyGoal > 0 ? Math.min(1, xpToday / dailyGoal) : 0;
  const r = 20;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - pct);

  return (
    <section className="hm-streak" data-testid="streak-tile" aria-label={`${detail.current}-day streak`}>
      <div className="hm-sh">
        <span className="hm-t"><Icon name="flame" /> Daily streak</span>
        <span className="hm-goalring" role="img" aria-label={`Daily goal ${xpToday} of ${dailyGoal} Lumens`}>
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,.32)" strokeWidth="5" />
            <circle cx="24" cy="24" r={r} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={off} transform="rotate(-90 24 24)" />
          </svg>
          <span className="hm-rc">{Math.round(pct * 100)}%</span>
        </span>
      </div>

      <div className="hm-big">
        <Icon name="flame" className="hm-flame ico" />
        <div>
          <div className="hm-snum disp">{detail.current}</div>
          <div className="hm-slbl">day streak</div>
        </div>
      </div>

      <ol className="hm-week" aria-hidden>
        {detail.week.map((d) => <WeekDot key={d.date} d={d} />)}
      </ol>

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
