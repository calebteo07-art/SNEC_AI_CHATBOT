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
 *  promotion line it is racing for. `roles` seeds the filter tabs. `pool_size`/`promote_count`
 *  describe the REAL division and are deliberately unaffected by the `role` view filter — see
 *  the router note.
 *
 *  `you_hidden` / `display_name` / `you_would_be_rank` are still sent by the server but no
 *  longer rendered anywhere: the visibility panel was removed on 2026-08-02. They stay typed
 *  because they remain part of the live GET contract. */
export interface LeaderboardData {
  entries: LeaderboardEntry[];
  you_hidden: boolean;
  display_name: string | null;
  /** Where a hidden viewer would stand if they un-hid. A hidden student has no row in
   *  `entries` — not even their own copy — so this is the only thing that can tell them
   *  their standing. Server-set for the hidden viewer alone; null for everyone else,
   *  who have a real ranked row instead. */
  you_would_be_rank: number | null;
  roles: string[];
  division: number;
  division_name: string;
  /** What this division PAYS: every Lumen earned anywhere in the app is multiplied by it.
   *  Server-sent, never derived here — the ladder lives in tools/gamification/league.py and
   *  a mirrored copy would drift the first time it is retuned, silently, because a wrong
   *  multiplier still renders. Defaults to 1 if an older server omits it. */
  division_multiplier: number;
  /** The whole ladder, Bronze-first, for the trophy road in the rules sheet. Same source as
   *  the scalar above, in the same response, so the two cannot disagree. */
  division_multipliers: number[];
  pool_size: number;
  promote_count: number;
}

/** The cohort leaderboard (D7): everyone by default, ranked by XP. An optional role
 *  filter ranks within a single role.
 *
 *  THROWS on a non-OK response. It used to degrade to a hardcoded empty board so the page
 *  could render before migration 008 landed — that migration has been applied since
 *  2026-07-30, and what the fallback left behind was worse than the gap it covered: a
 *  broken read painted a real-looking Bronze division with nobody in it, which a student
 *  reads as "my cohort has no scores", not as "this failed". `isError` is what the screen
 *  needs to tell them to reload (see ApiErrorNotice). */
export function useLeaderboard(role?: string | null) {
  return useQuery<LeaderboardData>({
    queryKey: ["leaderboard", role ?? "all"],
    queryFn: async () => {
      const qs = role ? `?role=${encodeURIComponent(role)}` : "";
      const res = await fetch(`/api/leaderboard${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(`leaderboard ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

/* NOTE: there is no `useSetLeaderboardPrefs` any more. The visibility panel was removed from
   /leaderboard on 2026-08-02 by request, which left this mutation exported and imported by
   nothing — exactly the shape that hid the last opt-out regression (214ab7f) for weeks. The
   endpoint POST /api/leaderboard/prefs is untouched and still works; restoring the write path
   means restoring a UI for it, not just re-adding a hook. */

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
