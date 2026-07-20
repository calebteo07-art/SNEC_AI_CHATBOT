/* LumenLadder — the Lumens VAULT badge collection. Each light/wealth tier unlocks as
   lifetime Lumens (coins_earned) climb: collected → next (glowing) → locked. */
import { LUMEN_BADGES } from "./lumenBadges";
import { LumenBadge } from "./LumenBadge";
import type { BadgeState } from "./EyeconBadge";

export function LumenLadder({ current = 0 }: { current?: number }) {
  const nextAt = LUMEN_BADGES.find((b) => current < b.at)?.at ?? null;
  const collected = LUMEN_BADGES.filter((b) => current >= b.at).length;

  return (
    <section className="hm-panel hm-panel--lumen" data-testid="lumen-ladder" aria-label="Lumens vault">
      <p className="hm-ph disp">
        Lumens vault
        <span className="hm-c">{collected} of {LUMEN_BADGES.length} collected</span>
      </p>
      <p className="hm-vault-note">Total Lumens ever earned - levelling up to get your badges!</p>
      <ol className="hm-badges">
        {LUMEN_BADGES.map((b) => {
          const state: BadgeState = current >= b.at ? "collected" : nextAt === b.at ? "next" : "locked";
          return <LumenBadge key={b.at} badge={b} state={state} toNext={b.at - current} />;
        })}
      </ol>
    </section>
  );
}
