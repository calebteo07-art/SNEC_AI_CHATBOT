import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { idbStorage } from "./idb";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 24 * 60 * 60_000,
      retry: (failureCount) => (navigator.onLine ? failureCount < 2 : false),
      networkMode: "offlineFirst",
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});

// Only wire up IDB persistence on the client — SSR has no IndexedDB
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
