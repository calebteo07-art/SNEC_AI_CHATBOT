"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

/* The shell (topbar, pill nav, Lenis scroller) persists across all
 * authenticated routes — App Router layouts don't remount on child
 * navigations, matching v1's <AppShell> layout route. */
const AppShell = dynamic(
  () => import("@/screens/AppShell").then((m) => m.AppShell),
  { ssr: false },
);

export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
