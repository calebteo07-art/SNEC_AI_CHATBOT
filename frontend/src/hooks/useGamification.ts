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
  xp_today?: number;
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
          // Keep the daily-goal ring in lock-step with the hero XP — both now read
          // from this same cache, so they move together instantly.
          xp_today: Math.max(0, (old.xp_today ?? 0) + payload.xp_delta),
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
        // Reconcile with the server, but keep the optimistic xp_today if the
        // server didn't send one back (older endpoint shape).
        const { xp_today, ...rest } = data;
        return { ...old, ...rest, xp_today: xp_today ?? old.xp_today };
      });
      // The streak detail (week dots, freezes) may have advanced server-side —
      // refetch so the band reflects truth without a full reload.
      qc.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}
