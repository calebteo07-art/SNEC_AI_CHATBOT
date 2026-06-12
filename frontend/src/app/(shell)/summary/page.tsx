"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const SummaryScreen = dynamic(
  () => import("@/screens/SummaryScreen").then((m) => m.SummaryScreen),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <SummaryScreen />
    </CheckInGuard>
  );
}