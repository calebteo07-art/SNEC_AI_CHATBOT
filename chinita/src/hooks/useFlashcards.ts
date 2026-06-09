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

export function useFlashcards() {
  return useQuery<FlashcardItem[]>({
    queryKey: ["flashcards"],
    queryFn: async () => {
      const res = await fetch("/api/flashcards/generate", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load flashcards");
      return res.json();
    },
    staleTime: 10 * 60_000,
    placeholderData: (prev) => prev,
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
