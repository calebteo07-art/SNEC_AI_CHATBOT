import { useQuery } from "@tanstack/react-query";

export type StreakDayState = "done" | "today" | "missed" | "upcoming" | "rest" | "rest-done";

export interface StreakDay {
  day: string;        // Mon..Sun
  date: string;       // ISO
  state: StreakDayState;
}

export interface StreakDetail {
  current: number;
  best: number;
  freezes: number;
  done_today: boolean;
  week: StreakDay[];
  /* Every day of the current calendar month, 1st → last (the Home streak card's
     calendar). Optional: a response persisted before this field shipped must render a
     missing calendar, never a broken one. */
  month?: StreakDay[];
  tier: string;
  next_tier: string | null;
  to_next: number;
}

export interface ProgressData {
  xp: number;
  coins_earned: number;
  xp_today: number;
  daily_goal: number;
  hearts: number;
  level: number;
  streak: number;
  session_count: number;
  learning_velocity: "improving" | "stable" | "declining";
  weak_topics: string[];
  topic_performance: { topic: string; score: number }[];
  sessions: { session_id: string; timestamp: string; topic: string; summary: string; mode: string }[];
  streak_detail?: StreakDetail;
}

async function fetchProgress(): Promise<ProgressData> {
  const res = await fetch("/api/progress", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch progress");
  return res.json();
}

export function useProgress() {
  return useQuery<ProgressData>({
    queryKey: ["progress"],
    queryFn: fetchProgress,
    // Gamification (streak / Lumens / level) must feel live: always refetch on mount
    // and treat the value as immediately stale so returning to any screen — or a
    // mutation invalidating ["progress"] — repaints fresh numbers. placeholderData
    // keeps the last value on screen during the refetch (no flash to zero).
    placeholderData: (prev) => prev,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
