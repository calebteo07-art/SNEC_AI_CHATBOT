import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChestState, QuestRow } from "@/aurora/lib/hud";

export interface LeagueStanding {
  rank: number; pool_size: number; promote_count: number;
  division_name: string; xp_to_promotion: number;
}
export interface BoostState { multiplier: number; until: string | null }

/* Every section is independently nullable: GET /api/home degrades per-section rather
   than failing whole, and a null must render as "couldn't load" — never as zeros. */
export interface HomeData {
  quests: QuestRow[] | null;
  chest: ChestState | null;
  boost: BoostState | null;
  league: LeagueStanding | null;
}

async function fetchHome(): Promise<HomeData> {
  const res = await fetch("/api/home", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch home");
  return res.json();
}

export function useHome() {
  return useQuery<HomeData>({
    queryKey: ["home"],
    queryFn: fetchHome,
    // Same liveness contract as ["progress"]: the quest tally must repaint the moment a
    // deck is cleared, and placeholderData keeps the last real values on screen during
    // the refetch rather than flashing to a skeleton.
    placeholderData: (prev) => prev,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

/** Claim today's chest. Idempotent server-side — the drop is pure over
 *  (student_id, date), so a retry cannot pay a different prize. */
export function useClaimChest() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; already_claimed: boolean; drop: { key: string; label: string } | null }, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/home/chest/claim", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Claim failed");
      return res.json();
    },
    // A chest drop can grant a streak freeze, which lives on the progress payload.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}

/** Claim a completed quest's XP. */
export function useClaimQuest() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; already_claimed: boolean; reward_xp?: number }, Error, string>({
    mutationFn: async (kind) => {
      const res = await fetch("/api/home/quest/claim", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) throw new Error("Claim failed");
      return res.json();
    },
    // The payout moves XP, which moves League rank — leaving ["progress"] or the rank
    // strip stale would show a student a reward that appears not to have landed.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}
