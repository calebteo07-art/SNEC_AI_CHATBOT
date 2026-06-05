import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProgressData } from "./useProgress";

interface SyncPayload {
  xp_delta: number;
  hearts_used: number;
  topic?: string;
  score?: number;
}

interface SyncResponse {
  xp: number;
  hearts: number;
  level: number;
  streak: number;
}

async function syncGamification(payload: SyncPayload): Promise<SyncResponse> {
  const res = await fetch("/api/gamification/sync", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Sync failed");
  return res.json();
}

export function useGamificationSync() {
  const qc = useQueryClient();

  return useMutation<SyncResponse, Error, SyncPayload, { prev: ProgressData | undefined }>({
    mutationFn: syncGamification,

    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["progress"] });
      const prev = qc.getQueryData<ProgressData>(["progress"]);
      qc.setQueryData<ProgressData>(["progress"], (old) => {
        if (!old) return old;
        const newXp = old.xp + payload.xp_delta;
        const newLevel = Math.floor(newXp / 500) + 1;  // mirrors backend formula
        return {
          ...old,
          xp: newXp,
          level: newLevel,
          hearts: Math.max(0, old.hearts - payload.hearts_used),
        };
      });
      return { prev };
    },

    onError: async (_err, vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["progress"], ctx.prev);
      }
      // Queue the payload for background sync replay
      const { queueSyncPayload } = await import("../lib/idb");
      await queueSyncPayload(vars);
      // Register background sync tag
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await (reg as any).sync.register("sync-gamification");
        } catch {}
      }
    },

    onSuccess: (data) => {
      qc.setQueryData<ProgressData>(["progress"], (old) => {
        if (!old) return old;
        return { ...old, ...data };
      });
    },
  });
}
