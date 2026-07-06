/* MilestoneLadder — the streak BADGE COLLECTION. Each eye-themed tier is a collectible
   Selena badge that unlocks as the weekday streak climbs: collected → next (glowing, with
   progress) → locked (mystery silhouette). Reads progress.streak_detail (current streak);
   thresholds mirror the streak engine. Base-mascot badges (home Iris lock). */
import type { StreakDetail } from "@/hooks/useProgress";
import { STREAK_BADGES } from "./streakBadges";
import { SelenaBadge, type BadgeState } from "./SelenaBadge";

export function MilestoneLadder({ detail }: { detail?: StreakDetail }) {
  const current = detail?.current ?? 0;
  const nextAt = STREAK_BADGES.find((b) => current < b.at)?.at ?? null;
  const collected = STREAK_BADGES.filter((b) => current >= b.at).length;

  return (
    <section className="hm-panel" data-testid="milestone-ladder" aria-label="Streak badge collection">
      <p className="hm-ph disp">
        Badge collection
        <span className="hm-c">{collected} of {STREAK_BADGES.length} collected</span>
      </p>
      <ol className="hm-badges">
        {STREAK_BADGES.map((b) => {
          const state: BadgeState = current >= b.at ? "collected" : nextAt === b.at ? "next" : "locked";
          return <SelenaBadge key={b.at} badge={b} state={state} toNext={b.at - current} />;
        })}
      </ol>
    </section>
  );
}
