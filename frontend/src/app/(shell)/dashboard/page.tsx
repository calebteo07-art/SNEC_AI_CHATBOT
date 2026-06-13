"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const Dashboard = dynamic(
  () => import("@/aurora/screens/Dashboard").then((m) => m.Dashboard),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <Dashboard />
    </CheckInGuard>
  );
}
