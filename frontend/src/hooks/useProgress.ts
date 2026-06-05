import { useQuery } from "@tanstack/react-query";

export interface ProgressData {
  xp: number;
  hearts: number;
  level: number;
  streak: number;
  session_count: number;
  learning_velocity: "improving" | "stable" | "declining";
  weak_topics: string[];
  topic_performance: { topic: string; score: number }[];
  sessions: { session_id: string; timestamp: string; topic: string; summary: string; mode: string }[];
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
