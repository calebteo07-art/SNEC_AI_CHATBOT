"use client";
/* The console route group. Providers (QueryClient + Auth) come from the ROOT layout,
   so this group simply omits AppShell — that is the whole point: no Atlas Rail, no
   student chrome, and the console owns its own <main>. */
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const AdminGuard = dynamic(
  () => import("@/screens/AdminGuard").then((m) => m.AdminGuard),
  { ssr: false },
);
const ConsoleShell = dynamic(
  () => import("@/aurora/console/ConsoleShell").then((m) => m.ConsoleShell),
  { ssr: false },
);

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGuard>
      <ConsoleShell>{children}</ConsoleShell>
    </AdminGuard>
  );
}
