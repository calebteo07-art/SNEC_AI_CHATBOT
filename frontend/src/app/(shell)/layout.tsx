"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

/* The AURORA shell (Atlas Rail + command palette + drifting mesh) persists
 * across all authenticated routes — App Router layouts don't remount on child
 * navigations. Replaces the legacy topbar/pill-nav shell. */
const AppShell = dynamic(
  () => import("@/aurora/AppShell").then((m) => m.AppShell),
  { ssr: false },
);

export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
