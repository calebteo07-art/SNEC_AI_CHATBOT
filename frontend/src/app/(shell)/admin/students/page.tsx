"use client";

import dynamic from "next/dynamic";

const AdminStudents = dynamic(
  () => import("@/aurora/screens/AdminStudents").then((m) => m.AdminStudents),
  { ssr: false },
);

export default function Page() {
  return <AdminStudents />;
}