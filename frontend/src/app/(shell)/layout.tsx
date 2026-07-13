"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { BrandSplash } from "@/aurora/components/BrandSplash";

/* The AURORA shell (Atlas Rail + command palette + drifting mesh) persists
 * across all authenticated routes — App Router layouts don't remount on child
 * navigations. While the shell chunk loads on first paint, show the branded
 * Eyecon splash (logo→raster brief). */
const AppShell = dynamic(
  () => import("@/aurora/AppShell").then((m) => m.AppShell),
  { ssr: false, loading: () => <BrandSplash /> },
);

export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
