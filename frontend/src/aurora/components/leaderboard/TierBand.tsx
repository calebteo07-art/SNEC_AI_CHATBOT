/* A slim tier divider that groups the ranked rows into a Bronze→Diamond ladder. */
import { TierCrest } from "./crests";
import type { Tier } from "@/aurora/leaderboard/tiers";

export function TierBand({ tier, count }: { tier: Tier; count: number }) {
  return (
    <div className="lb-band">
      <TierCrest tier={tier} size={18} />
      <span className="lb-bt" style={{ color: tier.ink }}>{tier.name}</span>
      <span className="lb-band-line" aria-hidden />
      <span className="lb-band-cnt">{tier.min.toLocaleString()}+ Lumens · {count}</span>
    </div>
  );
}
