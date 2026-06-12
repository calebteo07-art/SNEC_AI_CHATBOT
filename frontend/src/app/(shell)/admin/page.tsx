"use client";

import dynamic from "next/dynamic";

const AdminOverviewPage = dynamic(
  () => import("@/screens/AdminOverviewPage").then((m) => m.AdminOverviewPage),
  { ssr: false },
);

export default function Page() {
  return <AdminOverviewPage />;
}