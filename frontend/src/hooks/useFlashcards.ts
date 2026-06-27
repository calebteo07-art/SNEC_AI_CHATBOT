import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface FlashcardItem {
  card_id: string;
  stem: string;
  options: string[];
  correct: number[];
  qtype: "single" | "multi";
  kind: "theory" | "practical";
  explanation: string;
  requires_explanation: boolean;
  topic_tag: string;
  difficulty: string;
  repetitions: number;
  easiness: number;
  interval_days: number;
}

export interface ReasonCheckPayload {
  question: string;        // the stem
  student_answer: string;  // typed reasoning
  correct_answer: string;  // the explanation (model answer)
}
export interface ReasonCheckResponse { score: number; feedback: string; mock_mode: boolean; }

export interface CompleteCardResult {
  card_id?: string; correct: boolean;
  repetitions?: number; easiness?: number; interval_days?: number;
}
export interface CompletePayload { results: CompleteCardResult[]; xp_delta: number; }
export interface CompleteResponse { xp: number; level: number; }

export interface FlashcardSetInfo {
  set_key: string;
  topic_key: string;
  label: string;
  difficulty: string;
  total: number;
  completed: number;
}

/** The selectable sets (topics x difficulties) for the student's role. */
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

/** Grade ONE typed reasoning answer. Called in the background (not awaited on reveal). */
export function useReasonCheck() {
  return useMutation<ReasonCheckResponse, Error, ReasonCheckPayload>({
    mutationFn: async (payload) => {
      const res = await fetch("/api/flashcards/check", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Check failed");
      return res.json();
    },
  });
}

/** Batched end-of-deck persistence: SM-2 schedule + XP, one call. */
export function useFlashcardComplete() {
  const qc = useQueryClient();
  return useMutation<CompleteResponse, Error, CompletePayload>({
    mutationFn: async (payload) => {
      const res = await fetch("/api/flashcards/complete", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Complete failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flashcards"] });
      qc.invalidateQueries({ queryKey: ["flashcard-due-count"] });
    },
  });
}
