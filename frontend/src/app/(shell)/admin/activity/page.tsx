"use client";

import dynamic from "next/dynamic";

const AdminActivityPage = dynamic(
  () => import("@/screens/AdminActivityPage").then((m) => m.AdminActivityPage),
  { ssr: false },
);

export default function Page() {
  return <AdminActivityPage />;
}