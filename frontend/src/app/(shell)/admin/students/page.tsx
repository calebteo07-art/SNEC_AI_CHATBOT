"use client";

import dynamic from "next/dynamic";

const AdminStudentsPage = dynamic(
  () => import("@/screens/AdminStudentsPage").then((m) => m.AdminStudentsPage),
  { ssr: false },
);

export default function Page() {
  return <AdminStudentsPage />;
}