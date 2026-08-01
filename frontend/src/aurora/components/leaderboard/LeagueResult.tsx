"use client";
/* The Monday ceremony — what happened to your week.

   Fires once per closed week, on the first safe screen the student opens. The show-once flag
   lives on the SERVER (student_profiles.league_result_seen_week), not in localStorage, so the
   ceremony can't replay on a second device — and it stores WHICH week was seen, so next
   Monday's result still comes through. See GET /api/league/result.

   The stage language is the board's: black, one gold beam, the division badge lit at the end
   of it. A promotion gets confetti; holding does not — a consolation animation would read as
   sarcasm. Both get their real numbers, because "you finished 9th with 1,240 Lumens" is the
   part a student can act on next week. */
import { useEffect, useRef } from "react";
import { confetti } from "@/fx/confetti";
import { useLeagueResult, useMarkResultSeen } from "@/hooks/useLeaderboard";

export function LeagueResult({ enabled }: { enabled: boolean }) {
  const { data: result } = useLeagueResult(enabled);
  const seen = useMarkResultSeen();
  const fired = useRef(false);

  useEffect(() => {
    if (!result || result.outcome !== "promoted" || fired.current) return;
    fired.current = true;
    const reduce = document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    confetti({ particleCount: 130, spread: 82, origin: { y: 0.34 },
               colors: ["#F5C542", "#FFE9A8", "#B07D12", "#FFFFFF"] });
  }, [result]);

  if (!result) return null;

  const promoted = result.outcome === "promoted";
  const rank = result.rank_final;

  return (
    <div className="lr" data-testid="league-result" data-outcome={result.outcome} role="dialog"
         aria-modal="true" aria-label="Your league result">
      <div className="lr-ray" aria-hidden />
      <div className="lr-card">
        <p className="lr-eyebrow">Last week&apos;s league</p>

        <p className="lr-verdict">{promoted ? "Promoted" : result.outcome === "placed" ? "You placed" : "You held"}</p>

        <div className="lr-move">
          <span className="lr-div lr-from">{result.from_division_name}</span>
          {promoted && (
            <>
              <span className="lr-arrow" aria-hidden>→</span>
              <span className="lr-div lr-to">{result.to_division_name}</span>
            </>
          )}
        </div>

        <p className="lr-line">
          {rank ? `You finished #${rank}` : "You finished the week"} with{" "}
          <strong>{result.xp_final.toLocaleString()}</strong> Lumens.
        </p>
        <p className="lr-next">
          {promoted
            ? `${result.to_division_name} starts now — the new week is already running.`
            : "A new week is already running. Nobody is ever demoted, so every week is a fresh climb."}
        </p>

        <button type="button" className="lr-go" data-testid="league-result-go"
                onClick={() => seen.mutate(result.week_start)}>
          Continue
        </button>
      </div>
    </div>
  );
}
