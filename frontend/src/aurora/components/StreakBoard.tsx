"use client";
/* StreakBoard — the LinkedIn-inspired streak panel that fills the lower dashboard
   (replaces the old recall/mastery/due stat cards). A stats strip (current / best /
   freezes / this week) over a milestone tier ladder that lights up as the weekday
   streak climbs. Reads progress.streak_detail. */
import type { StreakDetail } from "@/hooks/useProgress";

const TIERS: { at: number; name: string; hue: string }[] = [
  { at: 3, name: "First Light", hue: "#19C3DE" },
  { at: 5, name: "Clear View", hue: "#3C90FF" },
  { at: 10, name: "20/20 Vision", hue: "#7C5CF6" },
  { at: 20, name: "Eagle Eye", hue: "#E26FD0" },
  { at: 30, name: "Hawkeye", hue: "#F2698A" },
  { at: 50, name: "Visionary", hue: "#FBA838" },
];

const EYE = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const LOCK = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="aurora-sboard-stat">
      <span className="aurora-sboard-statval">{value}</span>
      <span className="aurora-sboard-statlbl">{label}</span>
    </div>
  );
}

export function StreakBoard({ detail }: { detail?: StreakDetail }) {
  if (!detail) return null;
  const { current, best, freezes, week } = detail;
  const doneThisWeek = week.filter((d) => d.state === "done").length;
  const nextAt = TIERS.find((t) => current < t.at)?.at ?? null;

  return (
    <section className="aurora-sboard" data-testid="streak-board" aria-label="Streak milestones">
      <div className="aurora-sboard-stats">
        <Stat value={current} label="Day streak" />
        <Stat value={best} label="Best streak" />
        <Stat value={freezes} label={freezes === 1 ? "Freeze ready" : "Freezes ready"} />
        <Stat value={`${doneThisWeek}/5`} label="This week" />
      </div>

      <p className="aurora-sboard-head">Milestones</p>
      <ol className="aurora-sboard-tiers">
        {TIERS.map((t) => {
          const achieved = current >= t.at;
          const isNext = nextAt === t.at;
          const state = achieved ? "done" : isNext ? "next" : "locked";
          return (
            <li
              key={t.at}
              className="aurora-sboard-tier"
              data-state={state}
              style={{ ["--tier-hue" as string]: t.hue }}
            >
              <span className="aurora-sboard-tierico" aria-hidden>{achieved || isNext ? EYE : LOCK}</span>
              <span className="aurora-sboard-tiername">{t.name}</span>
              <span className="aurora-sboard-tiermeta">
                {achieved ? "Unlocked" : isNext ? `${t.at - current} to go` : `${t.at} days`}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
