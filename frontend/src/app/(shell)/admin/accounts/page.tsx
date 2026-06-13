"use client";

import dynamic from "next/dynamic";

const AdminAccounts = dynamic(
  () => import("@/aurora/screens/AdminAccounts").then((m) => m.AdminAccounts),
  { ssr: false },
);

export default function Page() {
  return <AdminAccounts />;
}