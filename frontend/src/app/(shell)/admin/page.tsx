"use client";

import dynamic from "next/dynamic";

const AnalyticsGuard = dynamic(
  () => import("@/screens/AnalyticsGuard").then((m) => m.AnalyticsGuard),
  { ssr: false },
);
const Analytics = dynamic(
  () => import("@/aurora/screens/Analytics").then((m) => m.Analytics),
  { ssr: false },
);

export default function Page() {
  return (
    <AnalyticsGuard>
      <Analytics />
    </AnalyticsGuard>
  );
}
