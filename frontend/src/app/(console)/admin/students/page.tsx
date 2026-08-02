"use client";
import dynamic from "next/dynamic";

const AdminRoster = dynamic(
  () => import("@/aurora/screens/AdminRoster").then((m) => m.AdminRoster),
  { ssr: false },
);

export default function Page() {
  return <AdminRoster />;
}
