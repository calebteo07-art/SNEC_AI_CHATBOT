import { useQuery } from "@tanstack/react-query";

export interface ProgressData {
  xp: number;
  hearts: number;
  level: number;
  streak: number;
  session_count: number;
  learning_velocity: string;
  weak_topics: string[];
  topic_performance: Record<string, number>;
  sessions: Array<{ session_id: string; timestamp: string; topic: string; summary: string; mode: string }>;
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
    placeholderData: (prev) => prev,
  });
}
