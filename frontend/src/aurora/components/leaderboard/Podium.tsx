/* Top-3 podium. Visual order is 2nd · 1st · 3rd so the champion sits center + tallest.
   Each slot is a Nano-Banana metal card (gold/silver/bronze) — the student's <Eyecon>
   portrait drops onto the card's drawn plinth, with their name + Lumens in the lower banner. */
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { ChampionCrown } from "./crests";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import { Lumen } from "@/aurora/components/Lumen";

const PLACE = ["p1", "p2", "p3"];
const ORDER = [1, 0, 2]; // render 2nd, then 1st (center), then 3rd

export function Podium({ podium }: { podium: LeaderboardEntry[] }) {
  if (podium.length === 0) return null;
  return (
    <section className="lb-podium" data-testid="podium" aria-label="Top performers">
      {ORDER.filter((i) => i < podium.length).map((i) => {
        const e = podium[i];
        return (
          <div key={e.rank} className={`lb-ped ${PLACE[i]}`} data-testid="podium-slot">
            {i === 0 && <ChampionCrown />}
            <span className="lb-ped-face">
              <Eyecon portraitUrl={e.portrait_url} config={e.avatar_config} background={e.avatar_config?.background} size={i === 0 ? 92 : 68} />
            </span>
            <div className="lb-ped-body">
              <div className="lb-ped-nm">{e.name}</div>
              <div className="lb-ped-xp"><Lumen size={i === 0 ? 18 : 15} decorative />{e.xp.toLocaleString()}</div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
