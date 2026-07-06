import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AVATAR_AXES, type AvatarConfig } from "@/aurora/avatar/axes.generated";

/** GET /api/avatar returns the saved Selena config (or the default), the
 *  server-authoritative parts catalog, and the state of the cached 3D portrait
 *  (generated on save, keyed by config hash). `portrait_status` ∈
 *  none|pending|ready|failed|unavailable; `portrait_url` is set only when ready.
 *  The fields are optional + additive, so an older persisted ["avatar"] cache
 *  rehydrates harmlessly (they read as undefined → the SVG fallback) — no
 *  PERSIST_SCHEMA_VERSION bump needed. */
export interface AvatarResponse {
  config: AvatarConfig;
  axes: Record<string, string[]>;
  portrait_status?: string;
  portrait_url?: string | null;
}

/** The student's saved Selena. Persisted by TanStack (small + stable) so the home
 *  greeting can paint Selena offline. While a portrait render is in flight
 *  (status "pending") we poll so the UI swaps to the real 3D PNG the moment it's
 *  ready; polling stops as soon as the status settles. */
export function useAvatar() {
  return useQuery<AvatarResponse>({
    queryKey: ["avatar"],
    queryFn: async () => {
      const res = await fetch("/api/avatar", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load avatar");
      return res.json();
    },
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.portrait_status === "pending" ? 4000 : false),
  });
}

/** Kick off (or reuse) the 3D portrait render for the caller's SAVED look. The
 *  endpoint is cache-gated + rate-limited server-side, so calling it after every
 *  save is cheap — a genuinely new look generates once, everything else returns
 *  the cached URL. On success we refresh ["avatar"] so polling/swap can begin. */
export function useRequestPortrait() {
  const qc = useQueryClient();
  return useMutation<{ portrait_status: string; portrait_url: string | null }, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/avatar/portrait", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to request portrait");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["avatar"] }),
  });
}

/** Persist a Selena config. The server validates it fail-closed against the parts
 *  registry (422 on a bad id) before writing; on success we refresh the cached
 *  avatar so every surface repaints. Identity comes from the JWT, never the body. */
export function useSaveAvatar() {
  const qc = useQueryClient();
  return useMutation<{ config: AvatarConfig }, Error, AvatarConfig>({
    mutationFn: async (config) => {
      const res = await fetch("/api/avatar", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed to save avatar");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["avatar"] }),
  });
}

/** Total distinct Selena looks — product of every axis's option count. Shown as a
 *  fun (and honest) "one of N looks" stat; derived from the registry so it can't drift. */
export const AVATAR_COMBOS = Object.values(AVATAR_AXES).reduce((n, opts) => n * opts.length, 1);
