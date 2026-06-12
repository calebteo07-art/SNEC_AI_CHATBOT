"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const DashboardScreen = dynamic(
  () => import("@/screens/DashboardScreen").then((m) => m.DashboardScreen),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <DashboardScreen />
    </CheckInGuard>
  );
}