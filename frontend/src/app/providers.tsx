"use client";
/* Reproduces the v1 provider chain exactly:
 * main.tsx: QueryClientProvider[ App, Devtools(dev) ]
 * App.tsx:  ErrorBoundary[ OfflineBanner, AuthProvider[ <router>, Toaster ] ]
 * FxRoot:   MotionProvider[ AudioProvider[ TransitionProvider[ outlet,
 *           TransitionLayer ] ] ]  (v1's CursorLayer removed in PHOTOPIC)
 * The fx chain persists across all navigations because it lives in the root
 * layout — the App Router equivalent of v1's pathless FxRoot route. */
import { useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";
import "@/fx/gsapSetup";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/screens/AuthContext";
import { ErrorBoundary } from "@/screens/ErrorBoundary";
import { OfflineBanner } from "@/screens/OfflineBanner";
import { MotionProvider } from "@/fx/MotionProvider";
import { AudioProvider } from "@/fx/audio/useAudio";
import { TransitionProvider } from "@/fx/TransitionProvider";
import { TransitionLayer } from "@/fx/TransitionLayer";
import { Preloader } from "@/fx/preloader/Preloader";

/* The living canvas (WebGL) must never prerender. */
const FluidCanvas = dynamic(
  () => import("@/fx/canvas/FluidCanvas").then((m) => m.FluidCanvas),
  { ssr: false },
);

export function Providers({ children }: { children: ReactNode }) {
  /* v1 registered the service worker from main.tsx on window load. */
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
          <MotionProvider>
            <AudioProvider>
              {/* PHOTOPIC keeps the native system cursor — the v1 reticle
                  (CursorLayer) is gone; hover affordances live on elements.
                  z-map: fluid 0 < content 10 < chrome 20 < shutter 220. */}
              <TransitionProvider>
                <FluidCanvas />
                <div style={{ position: "relative", zIndex: 10, minHeight: "100%" }}>
                  {children}
                </div>
                <TransitionLayer />
                <Preloader />
              </TransitionProvider>
            </AudioProvider>
          </MotionProvider>
          <Toaster position="bottom-right" />
        </AuthProvider>
      </ErrorBoundary>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
