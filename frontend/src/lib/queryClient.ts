import { QueryClient, defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { idbStorage } from "./idb";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 24 * 60 * 60_000,
      retry: (failureCount) =>
        typeof navigator !== "undefined" && navigator.onLine ? failureCount < 2 : false,
      networkMode: "offlineFirst",
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});

/* Bump whenever a PERSISTED query's response shape changes. The persister discards
 * the entire stored cache when this differs from what's on disk, so data written by
 * an older app version can never be rehydrated into — and crash — newer UI. Without
 * it, a pre-MCQ flashcards deck ({front,back}, no `options`) cached under the same
 * ["flashcards", …] key was rehydrated and painted by the new MCQ card, whose
 * options.map() white-screened the page (prod incident 2026-06-27). */
const PERSIST_SCHEMA_VERSION = "7";  // bumped: ["flashcard-topics"] traded `completed` (cards seen) for `decks_completed`/`deck_count` (the 5-deck ladder)

/** Which queries are safe to write to the offline cache. The flashcards study DECK
 *  (["flashcards", …]) is deliberately excluded: it's ephemeral per-session content,
 *  persisting it stales the SM-2 / no-repeat rotation offline, and it's exactly the
 *  shape-drifting data that white-screened the study page. Topics, due-count, progress,
 *  cases, etc. stay persisted (useful and stable offline). */
export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] !== "flashcards";
}

/* Persistence is browser-only — this module is also evaluated during server
 * prerendering of the client provider tree. */
if (typeof window !== "undefined") {
  const persister = createAsyncStoragePersister({
    storage: idbStorage,
    key: "EYEBOT_QUERY_CACHE",
  });

  const [, persistPromise] = persistQueryClient({
    queryClient,
    persister,
    maxAge: 24 * 60 * 60_000,
    buster: PERSIST_SCHEMA_VERSION,
    dehydrateOptions: {
      // Keep the default "only successful queries" rule, then drop the deck.
      shouldDehydrateQuery: (query: Query) =>
        defaultShouldDehydrateQuery(query) && shouldPersistQueryKey(query.queryKey),
    },
  });
  // Suppress unhandled rejection — IDB unavailable (private browsing, quota exceeded) is non-fatal
  persistPromise.catch(() => {});
}
