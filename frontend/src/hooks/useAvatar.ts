import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AVATAR_AXES, type AvatarConfig } from "@/aurora/avatar/axes.generated";

/** GET /api/avatar returns the saved Selena config (or the default) plus the
 *  server-authoritative parts catalog. */
export interface AvatarResponse {
  config: AvatarConfig;
  axes: Record<string, string[]>;
}

/** The student's saved Selena. Persisted by TanStack (small + stable) so the home
 *  greeting can paint Selena offline. This is a NEW query key — no older cached
 *  shape can rehydrate into it, so no PERSIST_SCHEMA_VERSION bump is needed. */
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
