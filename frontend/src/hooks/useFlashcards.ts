import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface FlashcardItem {
  card_id: string;
  front: string;
  back: string;
  topic_tag: string;
  repetitions: number;
  easiness: number;
  interval_days: number;
}

export interface CheckPayload {
  question: string;
  student_answer: string;
  correct_answer: string;
  card_id?: string;
  repetitions?: number;
  easiness?: number;
  interval_days?: number;
}

export interface CheckResponse {
  score: number;
  feedback: string;
  mock_mode: boolean;
}

export interface FlashcardSetInfo {
  set_key: string;
  topic_key: string;
  label: string;
  difficulty: string;
  total: number;
  completed: number;
}

/** The 30 selectable sets (15 topics x easy/medium) for the student's role. */
export function useFlashcardTopics() {
  return useQuery<FlashcardSetInfo[]>({
    queryKey: ["flashcard-topics"],
    queryFn: async () => {
      const res = await fetch("/api/flashcards/topics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load flashcard topics");
      const data = await res.json();
      return data.sets ?? [];
    },
    staleTime: 10 * 60_000,
  });
}

/** Load a study deck. Pass a setKey ("topic__difficulty") to study one set,
 *  or null for the mixed/review no-repeat rotation across the whole role pool.
 *  `n` is the session length (Quick 5 / Standard 10 / Deep 20); a chosen set
 *  stays a fixed 5-card unit (n only caps it). */
export function useFlashcards(setKey: string | null, enabled = true, n = 6) {
  return useQuery<FlashcardItem[]>({
    queryKey: ["flashcards", setKey ?? "mixed", n],
    queryFn: async () => {
      const params = new URLSearchParams({ n: String(n) });
      if (setKey) params.set("set_key", setKey);
      const res = await fetch(`/api/flashcards/generate?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load flashcards");
      return res.json();
    },
    enabled,
    staleTime: 10 * 60_000,
    placeholderData: (prev) => prev,
  });
}

/** How many cards are due for review today (SM-2) — for the dashboard widget. */
export function useDueCount() {
  return useQuery<number>({
    queryKey: ["flashcard-due-count"],
    queryFn: async () => {
      const res = await fetch("/api/flashcards/due-count", { credentials: "include" });
      if (!res.ok) return 0;
      const d = await res.json();
      return d.count ?? 0;
    },
    staleTime: 5 * 60_000,
  });
}

export function useFlashcardCheck() {
  const qc = useQueryClient();
  return useMutation<CheckResponse, Error, CheckPayload>({
    mutationFn: async (payload) => {
      const res = await fetch("/api/flashcards/check", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Check failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flashcards"] });
    },
  });
}
