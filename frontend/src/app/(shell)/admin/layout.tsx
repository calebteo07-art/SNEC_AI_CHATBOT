"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const AdminGuard = dynamic(
  () => import("@/screens/AdminGuard").then((m) => m.AdminGuard),
  { ssr: false },
);
const AdminLayout = dynamic(
  () => import("@/screens/AdminLayout").then((m) => m.AdminLayout),
  { ssr: false },
);

export default function AdminSectionLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGuard>
      <AdminLayout>{children}</AdminLayout>
    </AdminGuard>
  );
}