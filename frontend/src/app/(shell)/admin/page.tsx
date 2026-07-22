"use client";

import dynamic from "next/dynamic";

const AdminGuard = dynamic(
  () => import("@/screens/AdminGuard").then((m) => m.AdminGuard),
  { ssr: false },
);
const Admin = dynamic(
  () => import("@/aurora/screens/Admin").then((m) => m.Admin),
  { ssr: false },
);

export default function Page() {
  return (
    <AdminGuard>
      <Admin />
    </AdminGuard>
  );
}
