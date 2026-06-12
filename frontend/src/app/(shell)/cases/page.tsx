"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const CaseListScreen = dynamic(
  () => import("@/screens/CaseListScreen").then((m) => m.CaseListScreen),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <CaseListScreen />
    </CheckInGuard>
  );
}