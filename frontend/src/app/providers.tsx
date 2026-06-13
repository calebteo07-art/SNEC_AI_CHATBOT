"use client";
/* AURORA provider chain — slimmed from the PHOTOPIC version. The heavy app-wide
 * fx layer (fluid WebGL canvas, preloader, route-wipe transition, motion/audio
 * providers, Lenis smooth-scroll) is gone; the AURORA shell drives its own calm,
 * CSS-only motion. What remains is data + auth + chrome:
 *   QueryClientProvider[ ErrorBoundary[ OfflineBanner, AuthProvider[ children,
 *   Toaster ] ], Devtools(dev) ]
 */
import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/screens/AuthContext";
import { ErrorBoundary } from "@/screens/ErrorBoundary";
import { OfflineBanner } from "@/screens/OfflineBanner";

export function Providers({ children }: { children: ReactNode }) {
  /* Register the service worker on load (unchanged from PHOTOPIC). */
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <OfflineBanner />
        <AuthProvider>
          <div style={{ position: "relative", minHeight: "100%" }}>{children}</div>
          <Toaster position="bottom-right" />
        </AuthProvider>
      </ErrorBoundary>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
