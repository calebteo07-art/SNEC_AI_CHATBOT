"use client";

import dynamic from "next/dynamic";

const AdminOverview = dynamic(
  () => import("@/aurora/screens/AdminOverview").then((m) => m.AdminOverview),
  { ssr: false },
);

export default function Page() {
  return <AdminOverview />;
}