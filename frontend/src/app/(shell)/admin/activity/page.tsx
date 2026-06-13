"use client";

import dynamic from "next/dynamic";

const AdminActivity = dynamic(
  () => import("@/aurora/screens/AdminActivity").then((m) => m.AdminActivity),
  { ssr: false },
);

export default function Page() {
  return <AdminActivity />;
}