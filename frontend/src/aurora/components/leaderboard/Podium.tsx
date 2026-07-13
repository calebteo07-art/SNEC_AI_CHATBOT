/* Top-3 podium. Visual order is 2nd · 1st · 3rd so the champion sits center + tallest.
   Each pedestal carries the student's <Selena> headshot, Lumens, their XP-tier crest,
   and a streak flame. */
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { tierForXp } from "@/aurora/leaderboard/tiers";
import { TierCrest, ChampionCrown } from "./crests";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import { Lumen } from "@/aurora/components/Lumen";

const PLACE = ["p1", "p2", "p3"];
const LABEL = ["Champion", "2nd", "3rd"];
const ORDER = [1, 0, 2]; // render 2nd, then 1st (center), then 3rd

export function Podium({ podium }: { podium: LeaderboardEntry[] }) {
  if (podium.length === 0) return null;
  return (
    <section className="lb-podium" data-testid="podium" aria-label="Top performers">
      {ORDER.filter((i) => i < podium.length).map((i) => {
        const e = podium[i];
        const tier = tierForXp(e.xp);
        return (
          <div key={e.rank} className={`lb-ped ${PLACE[i]}`} data-testid="podium-slot">
            <div className="lb-shine" aria-hidden />
            {i === 0 && <ChampionCrown />}
            <span className="lb-ped-rank">{LABEL[i]}</span>
            <span className="lb-ped-face">
              <Eyecon portraitUrl={e.portrait_url} config={e.avatar_config} background={e.avatar_config?.background} size={i === 0 ? 104 : 76} />
            </span>
            <div className="lb-ped-nm">{e.name}</div>
            <div className="lb-ped-role">{e.role}</div>
            <div className="lb-ped-xp"><Lumen size={i === 0 ? 18 : 15} decorative />{e.xp.toLocaleString()}<small> Lumens</small></div>
            <div className="lb-ped-tags">
              <span className="lb-ped-crest"><TierCrest tier={tier} size={15} /> {tier.name}</span>
              {e.streak_days > 0 && <span className="lb-ped-streak"><span aria-hidden>🔥</span> {e.streak_days}d</span>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
