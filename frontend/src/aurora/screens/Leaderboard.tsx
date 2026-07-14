"use client";
/* Leaderboard — vibrant & seamless (supersedes "The Climb" D7). One continuous board:
   header → podium (top 3) → one color-graded ranked list.
   Everyone-by-default, ranked by total Lumens. All gamification derives client-side from
   the existing /api/leaderboard payload — no backend change. */
import { useEffect, useMemo, useState } from "react";
import { confetti } from "@/fx/confetti";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { computeRivals, splitPodium } from "@/aurora/leaderboard/tiers";
import { LeaderboardHeader } from "@/aurora/components/leaderboard/LeaderboardHeader";
import { Podium } from "@/aurora/components/leaderboard/Podium";
import { LeaderboardRow } from "@/aurora/components/leaderboard/LeaderboardRow";

export function Leaderboard() {
  const [role, setRole] = useState<string | null>(null);
  const { data, isLoading } = useLeaderboard(role);

  const entries = data?.entries ?? [];
  const roles = data?.roles ?? [];
  const you = entries.find((e) => e.is_you);

  const rivals = useMemo(() => computeRivals(entries, you), [entries, you]);
  const { podium, rest } = useMemo(() => splitPodium(entries), [entries]);

  // A short, personal, addictive one-liner — the chase, folded into the header instead of a
  // separate spotlight card.
  const hook = useMemo(() => {
    if (you && you.rank === 1) return "You're #1 — everyone's chasing you. Hold the crown.";
    if (you && rivals?.above && rivals.above.rank <= 3) return `You're #${you.rank} — ${rivals.above.gap.toLocaleString()} Lumens from the podium.`;
    if (you && rivals?.above) return `You're #${you.rank} — ${rivals.above.gap.toLocaleString()} Lumens to overtake #${rivals.above.rank}.`;
    return "Everyone in your cohort, ranked by total Lumens. Study daily to climb.";
  }, [you, rivals]);

  // One-time celebration when the viewer is on the podium. Reduced-motion + once per browser
  // session; never fires for the (common) off-podium case. We check data-motion ourselves
  // because the confetti library only honours the OS media query, not the in-app toggle.
  useEffect(() => {
    if (!you || you.rank > 3) return;
    const reduce = document.documentElement.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || sessionStorage.getItem("eyebot_lb_podium_celebrated") === "1") return;
    sessionStorage.setItem("eyebot_lb_podium_celebrated", "1");
    confetti({ particleCount: 110, spread: 78, origin: { y: 0.32 }, colors: ["#F59E0B", "#FCD34D", "#E11D48", "#FB7185", "#F0431F"] });
  }, [you]);

  return (
    <div className="lb-climb" data-testid="leaderboard-root">
      <LeaderboardHeader roles={roles} role={role} onRole={setRole} hook={hook} />

      {isLoading && !data ? (
        <p className="lb-empty">Loading the board…</p>
      ) : entries.length === 0 ? (
        <p className="lb-empty" data-testid="lb-empty">
          The board&apos;s warming up — once your cohort starts earning Lumens, everyone shows up here.
        </p>
      ) : (
        <>
          <Podium podium={podium} />
          {rest.length > 0 && (
            <ol className="lb-list">
              {rest.map((e) => <LeaderboardRow key={`${e.rank}-${e.name}`} e={e} />)}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
