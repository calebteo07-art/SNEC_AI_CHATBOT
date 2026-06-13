"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const AdminGuard = dynamic(
  () => import("@/screens/AdminGuard").then((m) => m.AdminGuard),
  { ssr: false },
);
const AdminShell = dynamic(
  () => import("@/aurora/screens/AdminShell").then((m) => m.AdminShell),
  { ssr: false },
);

export default function AdminSectionLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGuard>
      <AdminShell>{children}</AdminShell>
    </AdminGuard>
  );
}