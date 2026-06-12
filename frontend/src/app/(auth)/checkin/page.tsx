"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const DailyCheckInScreen = dynamic(
  () => import("@/screens/DailyCheckInScreen").then((m) => m.DailyCheckInScreen),
  { ssr: false },
);

export default function CheckInPage() {
  return (
    <CheckInGuard>
      <DailyCheckInScreen />
    </CheckInGuard>
  );
}
