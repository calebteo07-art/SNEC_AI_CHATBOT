import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AvatarConfig } from "@/aurora/avatar/axes.generated";

/** One ranked row. `avatar_config` drives the client-side composited <Eyecon>. `name`
 *  is the student's full roster name (a self-chosen display name only fills in for staff,
 *  who have no roster row). */
export interface LeaderboardEntry {
  rank: number;
  name: string;
  role: string;
  xp: number;        // XP earned THIS week — the weekly-board score + ranking key
  xp_total: number;  // lifetime XP
  level: number;
  streak_days: number;
  avatar_config: Partial<AvatarConfig> | null;
  is_you: boolean;
  division: number;
  /** Places gained since the last daily snapshot. null = no prior snapshot, which the board
   *  must render as "new", never as a flat "no change" (see league.ts::arrowFor). */
  rank_delta: number | null;
}

/** The league payload: the viewer's own division, ranked by XP earned this week, plus the
 *  promotion line it is racing for. `you_hidden` + `display_name` prime the privacy controls;
 *  `roles` seeds the filter tabs. `pool_size`/`promote_count` describe the REAL division and
 *  are deliberately unaffected by the `role` view filter — see the router note. */
export interface LeaderboardData {
  entries: LeaderboardEntry[];
  you_hidden: boolean;
  display_name: string | null;
  roles: string[];
  division: number;
  division_name: string;
  pool_size: number;
  promote_count: number;
}

const EMPTY: LeaderboardData = {
  entries: [], you_hidden: false, display_name: null, roles: [],
  division: 1, division_name: "Bronze", pool_size: 0, promote_count: 0,
};

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

/** The viewer's outcome for the week that just closed — or nothing. */
export interface LeagueResult {
  week_start: string;
  outcome: "promoted" | "held" | "placed";
  rank_final: number | null;
  xp_final: number;
  from_division_name: string;
  to_division_name: string;
}

/** The Monday ceremony. The server decides whether there is anything to show — it returns
 *  `{result: null}` once the student has seen this week's — so the show-once rule holds
 *  across every device they log in from, which localStorage could never do.
 *
 *  Deliberately NOT persisted-cache-friendly: `gcTime: 0` and no refetch, so a stale
 *  rehydrated copy can't re-fire a ceremony the server has already retired. */
export function useLeagueResult(enabled = true) {
  return useQuery<LeagueResult | null>({
    queryKey: ["league-result"],
    queryFn: async () => {
      const res = await fetch("/api/league/result", { credentials: "include" });
      if (!res.ok) return null;
      const body = await res.json();
      return body?.outcome ? (body as LeagueResult) : null;
    },
    enabled,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Burn the ceremony for this week. Fire-and-forget by design: the celebration has already
 *  been shown, so a failed write must not trap the student behind a modal — the worst case
 *  is seeing it once more on the next load. */
export function useMarkResultSeen() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: async (week_start) => {
      const res = await fetch("/api/league/result/seen", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start }),
      });
      return res.ok ? res.json() : null;
    },
    onSettled: () => qc.setQueryData(["league-result"], null),
  });
}
