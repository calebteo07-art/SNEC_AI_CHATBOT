import { QueryClient } from "@tanstack/react-query";
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
  });
  // Suppress unhandled rejection — IDB unavailable (private browsing, quota exceeded) is non-fatal
  persistPromise.catch(() => {});
}
