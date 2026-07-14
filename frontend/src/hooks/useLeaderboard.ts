import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AvatarConfig } from "@/aurora/avatar/axes.generated";

/** One ranked row. `avatar_config` drives the client-side composited <Eyecon>. `name`
 *  is the student's display name or first-name + last-initial. */
export interface LeaderboardEntry {
  rank: number;
  name: string;
  role: string;
  xp: number;
  level: number;
  streak_days: number;
  avatar_config: Partial<AvatarConfig> | null;
  is_you: boolean;
}

/** The D7 leaderboard payload: everyone is ranked by XP unless hidden. `you_hidden`
 *  + `display_name` prime the viewer's own controls; `roles` seeds the filter tabs. */
export interface LeaderboardData {
  entries: LeaderboardEntry[];
  you_hidden: boolean;
  display_name: string | null;
  roles: string[];
}

const EMPTY: LeaderboardData = { entries: [], you_hidden: false, display_name: null, roles: [] };

/** The cohort leaderboard (D7): everyone by default, ranked by XP. An optional role
 *  filter ranks within a single role. Degrades to an empty board (never throws) so the
 *  page renders before migration 008 lands. */
export function useLeaderboard(role?: string | null) {
  return useQuery<LeaderboardData>({
    queryKey: ["leaderboard", role ?? "all"],
    queryFn: async () => {
      const qs = role ? `?role=${encodeURIComponent(role)}` : "";
      const res = await fetch(`/api/leaderboard${qs}`, { credentials: "include" });
      if (!res.ok) return EMPTY;
      return res.json();
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

/** Update the caller's leaderboard preferences — hide/show themselves (D7 opt-out)
 *  and/or set an optional display name. On success we refresh every ["leaderboard", …]
 *  view so the change lands immediately. */
export function useSetLeaderboardPrefs() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { hidden?: boolean; display_name?: string }>({
    mutationFn: async (body) => {
      const res = await fetch("/api/leaderboard/prefs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update leaderboard preference");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaderboard"] }),
  });
}
