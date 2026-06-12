"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const ProgressScreen = dynamic(
  () => import("@/screens/ProgressScreen").then((m) => m.ProgressScreen),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <ProgressScreen />
    </CheckInGuard>
  );
}