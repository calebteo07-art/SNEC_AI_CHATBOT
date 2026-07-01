/* MilestoneLadder — the streak tier ladder. Each tier lights up as the weekday
   streak climbs: unlocked → next (glowing) → locked. Reads progress.streak_detail
   (current streak). Tier thresholds mirror the streak engine. */
import type { StreakDetail } from "@/hooks/useProgress";
import { Icon } from "./HomeIcons";

const TIERS: { at: number; name: string; icon: string }[] = [
  { at: 3, name: "First Light", icon: "sun" },
  { at: 5, name: "Clear View", icon: "lens" },
  { at: 10, name: "20/20 Vision", icon: "eye" },
  { at: 20, name: "Eagle Eye", icon: "eagle" },
  { at: 30, name: "Hawkeye", icon: "vp" },
  { at: 50, name: "Visionary", icon: "spark" },
];

export function MilestoneLadder({ detail }: { detail?: StreakDetail }) {
  const current = detail?.current ?? 0;
  const nextAt = TIERS.find((t) => current < t.at)?.at ?? null;
  const unlocked = TIERS.filter((t) => current >= t.at).length;

  return (
    <section className="hm-panel" data-testid="milestone-ladder" aria-label="Streak milestones">
      <p className="hm-ph disp">Streak milestones <span className="hm-c">{unlocked} of {TIERS.length} unlocked</span></p>
      <ol className="hm-miles">
        {TIERS.map((t) => {
          const done = current >= t.at;
          const isNext = nextAt === t.at;
          const cls = "hm-mile" + (done ? " done" : isNext ? " next" : "");
          const meta = done ? "Done" : isNext ? `${t.at - current} to go` : `${t.at} days`;
          return (
            <li key={t.at} className={cls}>
              <span className="hm-mi"><Icon name={t.icon} /></span>
              <span className="hm-mn">{t.name}</span>
              <span className="hm-mm">{meta}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
