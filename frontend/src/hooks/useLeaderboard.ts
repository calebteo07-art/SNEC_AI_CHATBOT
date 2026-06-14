import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  xp: number;
  level: number;
  is_you: boolean;
}

export interface LeaderboardData {
  enabled: boolean;
  opted_in: boolean;
  entries: LeaderboardEntry[];
}

/** The cohort leaderboard — disabled (and empty) unless a supervisor has turned
 *  it on AND the student has opted in. */
export function useLeaderboard() {
  return useQuery<LeaderboardData>({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard", { credentials: "include" });
      if (!res.ok) return { enabled: false, opted_in: false, entries: [] };
      return res.json();
    },
    staleTime: 60_000,
  });
}

/** Join (true) or leave (false) the cohort leaderboard. */
export function useLeaderboardOptIn() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, boolean>({
    mutationFn: async (optIn: boolean) => {
      const res = await fetch("/api/leaderboard/opt-in", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opt_in: optIn }),
      });
      if (!res.ok) throw new Error("Failed to update leaderboard preference");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaderboard"] }),
  });
}
