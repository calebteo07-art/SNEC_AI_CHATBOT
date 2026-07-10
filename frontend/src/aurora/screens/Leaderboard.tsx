"use client";
/* Leaderboard "The Climb" (ricoe D7 refresh). Everyone-by-default XP board, dramatized:
   podium (top 3), a live rivalry spotlight, XP tiers (Bronze→Diamond), glowing tiered
   rows, and demoted settings. All gamification derives client-side from the existing
   /api/leaderboard payload — no backend change. */
import { useEffect, useMemo, useState } from "react";
import { confetti } from "@/fx/confetti";
import { useLeaderboard, useSetLeaderboardPrefs } from "@/hooks/useLeaderboard";
import { computeRivals, splitPodium, bandRows } from "@/aurora/leaderboard/tiers";
import { LeaderboardHeader } from "@/aurora/components/leaderboard/LeaderboardHeader";
import { Podium } from "@/aurora/components/leaderboard/Podium";
import { RivalrySpotlight } from "@/aurora/components/leaderboard/RivalrySpotlight";
import { TierBand } from "@/aurora/components/leaderboard/TierBand";
import { LeaderboardRow } from "@/aurora/components/leaderboard/LeaderboardRow";
import { BoardSettings } from "@/aurora/components/leaderboard/BoardSettings";

export function Leaderboard() {
  const [role, setRole] = useState<string | null>(null);
  const { data, isLoading } = useLeaderboard(role);
  const prefs = useSetLeaderboardPrefs();

  const entries = data?.entries ?? [];
  const roles = data?.roles ?? [];
  const youHidden = data?.you_hidden ?? false;
  const you = entries.find((e) => e.is_you);

  const rivals = useMemo(() => computeRivals(entries, you), [entries, you]);
  const { podium, rest } = useMemo(() => splitPodium(entries), [entries]);
  const bands = useMemo(() => bandRows(rest), [rest]);
  const topXp = entries[0]?.xp ?? 0;

  const hook = useMemo(() => {
    if (youHidden) return "You're hidden — show yourself to join the climb.";
    if (you && rivals?.above && rivals.above.rank <= 3) return `Everyone in your cohort, ranked by total XP. You're ${rivals.above.gap.toLocaleString()} XP from the podium.`;
    if (you && rivals?.above) return `Everyone in your cohort, ranked by total XP. ${rivals.above.gap.toLocaleString()} XP to your next rank.`;
    return "Everyone in your cohort, ranked by total XP. Study daily to climb — your Selena rides along.";
  }, [you, rivals, youHidden]);

  // One-time celebration when the viewer is on the podium. Reduced-motion + once per
  // browser session; never fires for the (common) off-podium case. We check data-motion
  // ourselves because the confetti library only honours the OS media query, not the
  // in-app profile toggle.
  useEffect(() => {
    if (!you || you.rank > 3) return;
    const reduce = document.documentElement.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || sessionStorage.getItem("eyebot_lb_podium_celebrated") === "1") return;
    sessionStorage.setItem("eyebot_lb_podium_celebrated", "1");
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.35 }, colors: ["#7C5CF6", "#12B5A0", "#FB8C28", "#F4557A"] });
  }, [you]);

  return (
    <div className="lb-climb" data-testid="leaderboard-root">
      <LeaderboardHeader roles={roles} role={role} onRole={setRole} hook={hook} />

      {isLoading && !data ? (
        <p className="lb-empty">Loading the board…</p>
      ) : entries.length === 0 ? (
        <p className="lb-empty" data-testid="lb-empty">
          The board&apos;s warming up — once your cohort starts earning XP, everyone shows up here.
        </p>
      ) : (
        <>
          <Podium podium={podium} />
          <RivalrySpotlight you={you} rivals={rivals} youHidden={youHidden} onShow={() => prefs.mutate({ hidden: false })} />
          {bands.map((band) => (
            <div key={band.tier.id} className="lb-band-group">
              <TierBand tier={band.tier} count={band.rows.length} />
              <ol className="lb-list">
                {band.rows.map((e) => <LeaderboardRow key={`${e.rank}-${e.name}`} e={e} topXp={topXp} />)}
              </ol>
            </div>
          ))}
        </>
      )}

      <BoardSettings
        youHidden={youHidden}
        displayName={data?.display_name ?? null}
        pending={prefs.isPending}
        onToggle={(hidden) => prefs.mutate({ hidden })}
        onSaveName={(name) => prefs.mutate({ display_name: name })}
      />
    </div>
  );
}
