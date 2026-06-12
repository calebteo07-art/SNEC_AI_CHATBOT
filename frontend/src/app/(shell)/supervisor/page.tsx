"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const SupervisorDashboard = dynamic(
  () => import("@/screens/SupervisorDashboard").then((m) => m.SupervisorDashboard),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <SupervisorDashboard />
    </CheckInGuard>
  );
}