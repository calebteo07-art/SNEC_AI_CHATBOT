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
  /** Which rung of the topic's 5-deck ladder this came from (0 = Mixed/review).
   *  The server decides it; the client only echoes it back on /complete. */
  deck_level: number;
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
  /** REQUIRED, not optional. POST /api/flashcards/complete keeps only results with a
   *  truthy topic_tag (tools/api/routers/student.py:468) -- for BOTH the
   *  flashcard_attempts insert and the per-topic retention write. Omitting it returned
   *  200 and silently discarded every attempt, which is why the table held 0 rows in
   *  production. Required so a regression is a `npm run typecheck` failure, not a
   *  runtime one nobody sees. */
  topic_tag: string;
  /** Points banked for this card (analytics only) -- the `score` column on
   *  flashcard_attempts, migration 010. */
  score: number;
}
export interface CompletePayload {
  results: CompleteCardResult[];
  xp_delta: number;
  /** The ladder rung just cleared. Both are needed to record progress — without
   *  them the server treats the deck as unplaced (the Mixed deck) and files no
   *  progress, which is correct for Mixed and a bug anywhere else. */
  topic_key?: string;
  level?: number;
}
export interface CompleteResponse { xp: number; level: number; }

export interface FlashcardSetInfo {
  set_key: string;
  topic_key: string;
  label: string;
  difficulty: string;
  total: number;
  /** Rungs cleared on this topic's ladder, and how many there are (the "3/5"). */
  decks_completed: number;
  deck_count: number;
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

/** Load a study deck. Pass a setKey (a topic_key) to study that topic — one rung of
 *  its 5-deck difficulty ladder — or null for the mixed/review no-repeat rotation
 *  across the whole role pool. `n` is the fixed deck length (default 10).
 *  `level` picks an explicit rung (the replay picker); omit it and the server serves
 *  the next uncleared one. */
export function useFlashcards(setKey: string | null, enabled = true, n = 10, level: number | null = null) {
  return useQuery<FlashcardItem[]>({
    queryKey: ["flashcards", setKey ?? "mixed", n, level ?? "next"],
    queryFn: async () => {
      const params = new URLSearchParams({ n: String(n) });
      if (setKey) params.set("set_key", setKey);
      if (level) params.set("level", String(level));
      const res = await fetch(`/api/flashcards/generate?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load flashcards");
      return res.json();
    },
    enabled,
    staleTime: 10 * 60_000,
    placeholderData: (prev) => prev,
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
      qc.invalidateQueries({ queryKey: ["progress"] });
      // The rung just cleared moves the topic's x/5 counter — without this the
      // picker keeps showing the pre-deck count until the 10-minute staleTime.
      qc.invalidateQueries({ queryKey: ["flashcard-topics"] });
    },
  });
}
