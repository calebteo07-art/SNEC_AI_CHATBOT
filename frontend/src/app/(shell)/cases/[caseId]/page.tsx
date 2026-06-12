"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const CaseSessionScreen = dynamic(
  () => import("@/screens/CaseSessionScreen").then((m) => m.CaseSessionScreen),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <CaseSessionScreen />
    </CheckInGuard>
  );
}