/* Top-3 podium. Visual order is 2nd · 1st · 3rd so the champion sits center + tallest.
   Each slot is a Nano-Banana metal card (gold/silver/bronze): the student's <Eyecon> portrait
   drops into the drawn circular plinth, their Lumens sit in a score-chip on the mid panel, and
   their name is engraved on the card's lower nameplate plaque. All three places always render —
   an unclaimed spot shows an "open" plinth so the podium is present even for a cohort of one. */
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { ChampionCrown } from "./crests";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import { Lumen } from "@/aurora/components/Lumen";

const PLACE = ["p1", "p2", "p3"];
const ORDER = [1, 0, 2]; // render 2nd, then 1st (center), then 3rd

export function Podium({ podium }: { podium: LeaderboardEntry[] }) {
  return (
    <section className="lb-podium" data-testid="podium" aria-label="Top performers">
      {ORDER.map((i) => {
        const e = podium[i];
        if (!e) {
          return (
            <div key={`open-${i}`} className={`lb-ped ${PLACE[i]} lb-ped-open`} data-testid="podium-slot">
              <span className="lb-ped-face"><span className="lb-ped-ph" aria-hidden>?</span></span>
              <div className="lb-ped-xp">—</div>
              <div className="lb-ped-nm">Open spot</div>
            </div>
          );
        }
        return (
          <div key={e.rank} className={`lb-ped ${PLACE[i]}`} data-testid="podium-slot">
            {i === 0 && <ChampionCrown />}
            <span className="lb-ped-face">
              <Eyecon config={e.avatar_config} background={e.avatar_config?.background} size={i === 0 ? 84 : 62} />
            </span>
            <div className="lb-ped-xp"><Lumen size={i === 0 ? 17 : 14} decorative />{e.xp.toLocaleString()}</div>
            <div className="lb-ped-nm">{e.name}</div>
          </div>
        );
      })}
    </section>
  );
}
