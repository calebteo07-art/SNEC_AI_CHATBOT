import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AVATAR_AXES, type AvatarConfig } from "@/aurora/avatar/axes.generated";

/** GET /api/avatar returns the saved Eyecon config (or the default) and the
 *  server-authoritative parts catalog. The Eyecon avatar is composited
 *  client-side from this config — there is no server-rendered portrait. */
export interface AvatarResponse {
  config: AvatarConfig;
  axes: Record<string, string[]>;
  /** True once the student has saved any config — false only for a never-customized
   *  student. Drives the first-run "Create your Eyecon" onboarding gate (ricoe §7). */
  customized?: boolean;
}

/** The student's saved Eyecon. Persisted by TanStack (small + stable) so the home
 *  greeting can paint Eyecon offline. */
export function useAvatar(enabled = true) {
  return useQuery<AvatarResponse>({
    queryKey: ["avatar"],
    queryFn: async () => {
      const res = await fetch("/api/avatar", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load avatar");
      return res.json();
    },
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

/** Persist a Eyecon config. The server validates it fail-closed against the parts
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

/** Total distinct Eyecon looks — product of every axis's option count. Shown as a
 *  fun (and honest) "one of N looks" stat; derived from the registry so it can't drift. */
export const AVATAR_COMBOS = Object.values(AVATAR_AXES).reduce((n, opts) => n * opts.length, 1);
