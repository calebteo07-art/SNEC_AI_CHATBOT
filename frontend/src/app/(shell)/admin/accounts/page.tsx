"use client";

import dynamic from "next/dynamic";

const AdminAccountsPage = dynamic(
  () => import("@/screens/AdminAccountsPage").then((m) => m.AdminAccountsPage),
  { ssr: false },
);

export default function Page() {
  return <AdminAccountsPage />;
}