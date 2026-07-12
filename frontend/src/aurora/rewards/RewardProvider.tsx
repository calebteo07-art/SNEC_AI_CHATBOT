"use client";
/* RewardProvider — app-wide reward queue. Runs the derived watcher (level/streak/Lumens)
   and exposes enqueue() for moment-based achievements. Shows one banner at a time. The
   watcher lives in an inner component mounted ONLY when authenticated, so /api/progress
   is never fetched on the login route. */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "@/screens/AuthContext";
import type { Reward } from "./types";
import { RewardBanner } from "./RewardBanner";
import { useRewardWatcher } from "./useRewards";

interface Ctx { enqueue: (r: Reward) => void; }
const RewardCtx = createContext<Ctx>({ enqueue: () => {} });
export function useReward() { return useContext(RewardCtx); }

/** Mounted only when authed — isolates the useProgress-driven watcher hook. */
function RewardWatcher({ enqueue }: { enqueue: (r: Reward) => void }) {
  useRewardWatcher(enqueue);
  return null;
}

export function RewardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [queue, setQueue] = useState<Reward[]>([]);
  const [current, setCurrent] = useState<Reward | null>(null);

  const enqueue = useCallback((r: Reward) => {
    setQueue((q) => (q.some((x) => x.id === r.id) ? q : [...q, r]));
  }, []);
  const dismiss = useCallback(() => setCurrent(null), []);

  useEffect(() => {
    if (current || queue.length === 0) return;
    setCurrent(queue[0]);
    setQueue((q) => q.slice(1));
  }, [current, queue]);

  return (
    <RewardCtx.Provider value={{ enqueue }}>
      {user && <RewardWatcher enqueue={enqueue} />}
      {children}
      {current && <RewardBanner key={current.id} reward={current} onDone={dismiss} />}
    </RewardCtx.Provider>
  );
}
