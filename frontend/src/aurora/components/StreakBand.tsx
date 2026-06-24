"use client";
/* StreakBand — the "Week Lens". A full-width band under the dashboard hero that
   makes the daily check-in streak the centre of daily use: an animated solid
   flame + editorial streak number, the week as per-day jewel "pupil" dots (each
   weekday its own hue, weekends are dashed moon rest days), and freeze / best /
   next-tier chips. When today isn't checked in yet it doubles as the check-in
   nudge. Reads progress.streak_detail (server-computed); renders nothing until
   that data arrives. */
import Link from "next/link";
import type { StreakDay, StreakDetail } from "@/hooks/useProgress";

function Flame() {
  return (
    <svg className="aurora-flame" viewBox="0 0 48 60" width="46" height="58" aria-hidden role="img">
      <defs>
        <linearGradient id="aurora-flame-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FF4D2E" />
          <stop offset="0.55" stopColor="#FB8C28" />
          <stop offset="1" stopColor="#FFD56B" />
        </linearGradient>
        <linearGradient id="aurora-flame-core" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FFCF54" />
          <stop offset="1" stopColor="#FFF6D6" />
        </linearGradient>
      </defs>
      <path
        className="aurora-flame-outer"
        fill="url(#aurora-flame-grad)"
        d="M24 4 C30 18 36 22 36 34 C36 45 30 54 24 56 C18 54 12 45 12 34 C12 25 16 22 18 16 C20 22 22 24 24 26 C24 18 22 12 24 4 Z"
      />
      <path
        className="aurora-flame-core"
        fill="url(#aurora-flame-core)"
        d="M24 28 C28 34 30 38 30 44 C30 50 27 53 24 55 C21 53 18 50 18 44 C18 38 20 34 24 28 Z"
      />
    </svg>
  );
}

const CHECK = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);
const MOON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
    <path d="M16.5 14.8A7 7 0 0 1 9.2 7.5 5.6 5.6 0 0 0 8 7 5.5 5.5 0 1 0 17 16a5.6 5.6 0 0 0-.5-1.2Z" />
  </svg>
);
const SNOW = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <path d="M12 3v18M5 7l14 10M19 7L5 17" />
  </svg>
);

function dayLabel(d: StreakDay): string {
  if (d.state === "today") return "today";
  if (d.state === "rest" || d.state === "rest-done") return "rest";
  return d.day;
}

function DayDot({ d }: { d: StreakDay }) {
  const filled = d.state === "done" || d.state === "rest-done";
  const isRest = d.state === "rest" || d.state === "rest-done";
  return (
    <li className="aurora-week-day" data-state={d.state}>
      <span className="aurora-week-dot" aria-hidden>
        {filled ? CHECK : isRest ? MOON : null}
      </span>
      <span className="aurora-week-dl">{dayLabel(d)}</span>
    </li>
  );
}

export function StreakBand({ detail }: { detail?: StreakDetail }) {
  if (!detail) return null;
  const { current, best, freezes, done_today, week, tier, next_tier, to_next } = detail;
  const summary = `${current}-day streak, tier ${tier}${done_today ? ", checked in today" : ", not checked in today"}`;

  return (
    <section className="aurora-streakband" data-testid="streak-band" aria-label={summary}>
      <div className="aurora-streakband-lead">
        <Flame />
        <div className="aurora-streakband-count">
          <p className="aurora-streakband-numrow">
            <span className="aurora-streakband-num">{current}</span>
            <span className="aurora-streakband-unit">day{current === 1 ? "" : "s"}</span>
          </p>
          <span className="aurora-streakband-tier">{tier}</span>
        </div>
      </div>

      <ol className="aurora-streakband-week" aria-hidden>
        {week.map((d) => <DayDot key={d.date} d={d} />)}
      </ol>

      <div className="aurora-streakband-chips">
        {done_today ? (
          <span className="aurora-streakband-chip is-done">{CHECK}<span>Checked in today</span></span>
        ) : (
          <Link href="/checkin" className="aurora-streakband-cta">
            <span>{current > 0 ? `Check in to keep your ${current}-day streak` : "Check in to start your streak"}</span>
            <span aria-hidden>→</span>
          </Link>
        )}
        {freezes > 0 && (
          <span className="aurora-streakband-chip is-freeze">{SNOW}<span>{freezes} freeze ready</span></span>
        )}
        {best > 0 && <span className="aurora-streakband-chip is-best">Best {best}</span>}
        {next_tier && to_next > 0 && (
          <span className="aurora-streakband-chip is-next">{to_next} to {next_tier}</span>
        )}
      </div>
    </section>
  );
}
